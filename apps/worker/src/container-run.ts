import {
  claimContainerRun,
  finishContainerRun,
  getPreview,
  getTicket,
  MAX_OUTPUT_LINES,
  outputTail,
  recoverContainerRuns,
  schema,
  updateContainerRunOutput,
  type ContainerRun,
  type ContainerRunOutcome,
  type ContainerRuntime,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runIn } from './container-exec';
import { baseUrl } from './e2e';
import { ensureTicketContainer, REPO_DIR, type ProvisionConfig } from './provision';
import { startServicesRun } from './services-run';

/** Commands running at the same time, across tickets (one per ticket, by the queue's rule). */
const MAX_PARALLEL = 3;
/** How often the output so far is written for the panel. */
const OUTPUT_FLUSH_MS = 1000;
const MS_PER_SEC = 1000;
/** After SIGTERM, how long the command has to stop before SIGKILL. */
const KILL_GRACE_SEC = 3;

/**
 * The command runs in a process group of its own, whose id is kept in a file while it runs:
 * stopping the `docker exec` client does not stop what it started, so a cancel or a timeout kills
 * the group (the file is gone once the command ended by itself).
 */
const WRAPPER =
  'echo $$ > "$UNION_PID_FILE"; sh -lc "$UNION_COMMAND" 2>&1; code=$?; rm -f "$UNION_PID_FILE"; exit $code';
const KILL = `pg=$(cat "$UNION_PID_FILE" 2>/dev/null) || exit 0; kill -TERM -$pg 2>/dev/null; sleep ${KILL_GRACE_SEC}; kill -KILL -$pg 2>/dev/null; rm -f "$UNION_PID_FILE"`;

export type ContainerRunDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

/** The preview's address, as e2e gets it, while the ticket's preview runs. */
function previewEnv(db: Db, ticketId: number, projectId: number): Record<string, string> {
  const preview = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    ?.config.preview;
  const url =
    preview && getPreview(db, { ticketId })?.status === 'running' ? baseUrl(preview) : null;
  return url ? { BASE_URL: url, PREVIEW_URL: url } : {};
}

/** Streams the command's lines, keeping the last ones and writing them out once a second. */
async function streamed(
  db: Db,
  run: ContainerRun,
  exec: AsyncGenerator<string, { exitCode: number }>,
): Promise<{ exitCode: number | null; output: string }> {
  const lines: string[] = [];
  let flushed = Date.now();
  let exitCode: number | null = null;
  try {
    let next = await exec.next();
    while (!next.done) {
      lines.push(next.value);
      if (lines.length > MAX_OUTPUT_LINES) {
        lines.shift();
      }
      if (Date.now() - flushed >= OUTPUT_FLUSH_MS) {
        updateContainerRunOutput(db, run.id, outputTail(lines));
        flushed = Date.now();
      }
      // oxlint-disable-next-line no-await-in-loop -- the lines come one after the other
      next = await exec.next();
    }
    ({ exitCode } = next.value);
  } catch {
    // Stopped (cancel, timeout): the exit code is unknown.
  }
  return { exitCode, output: outputTail(lines) };
}

function outcomeOf(
  run: ContainerRun,
  result: { exitCode: number | null; output: string },
  signals: { cancel: AbortSignal; timeout: AbortSignal },
): ContainerRunOutcome {
  if (signals.cancel.aborted) {
    return { status: 'cancelled', exitCode: null, error: null, output: result.output };
  }
  if (signals.timeout.aborted) {
    const error = `Stopped after ${run.timeoutSec} s (the timeout)`;
    return { status: 'failed', exitCode: null, error, output: result.output };
  }
  const status = result.exitCode === 0 ? 'succeeded' : 'failed';
  return { status, exitCode: result.exitCode, error: null, output: result.output };
}

/** Runs the command in the ticket's container, started for it and stopped after unless a step started. */
async function execute(
  deps: ContainerRunDeps,
  run: ContainerRun,
  cancel: AbortSignal,
): Promise<ContainerRunOutcome> {
  const { db, runtime, config } = deps;
  if (run.ticketId === null) {
    const error = "Commands in a pull request's checkout are not supported yet";
    return { status: 'failed', exitCode: null, error, output: '' };
  }
  const ticket = getTicket(db, run.ticketId);
  if (ticket.phase.kind === 'running') {
    const error = 'A step started in this workspace: run it once it ends';
    return { status: 'failed', exitCode: null, error, output: '' };
  }
  const { name } = await ensureTicketContainer(db, runtime, config, ticket);
  // The same environment as the agent's: its services, on localhost, with its variables.
  const services = await startServicesRun(deps, ticket.id);
  const pidFile = { UNION_PID_FILE: `/tmp/union-run-${run.id}.pid` };
  const timeout = AbortSignal.timeout(run.timeoutSec * MS_PER_SEC);
  try {
    const exec = services.runtime.exec(name, ['setsid', '-w', 'sh', '-c', WRAPPER], {
      cwd: REPO_DIR,
      env: {
        ...previewEnv(db, ticket.id, ticket.projectId),
        ...pidFile,
        UNION_COMMAND: run.command,
      },
      signal: AbortSignal.any([cancel, timeout]),
    });
    const result = await streamed(db, run, exec);
    return outcomeOf(run, result, { cancel, timeout });
  } finally {
    await runIn(runtime, name, ['sh', '-c', KILL], { env: pidFile }).catch(() => null);
    // A step the user started meanwhile works in the same container: it stops it itself.
    const stepRuns = getTicket(db, ticket.id).phase.kind === 'running';
    await services.release(stepRuns);
    if (!stepRuns) {
      await runtime.stop(name);
    }
  }
}

/** Runs the commands users queue in tickets' workspaces, a few at a time. */
export class ContainerRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: ContainerRunDeps) {}

  recover(): void {
    recoverContainerRuns(this.deps.db);
  }

  tick(): void {
    while (this.active.size < MAX_PARALLEL) {
      const run = claimContainerRun(this.deps.db);
      if (!run) {
        return;
      }
      const abort = new AbortController();
      this.active.set(run.id, { abort, done: this.runTracked(run, abort.signal) });
    }
  }

  /** Stops a running command; it then finishes as cancelled. */
  cancel(id: number): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  private async runTracked(run: ContainerRun, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await execute(this.deps, run, signal).catch(
        (error: unknown): ContainerRunOutcome => ({
          status: 'failed',
          exitCode: null,
          error: error instanceof Error ? error.message : String(error),
          output: '',
        }),
      );
      finishContainerRun(this.deps.db, run.id, outcome);
    } finally {
      this.active.delete(run.id);
    }
  }
}
