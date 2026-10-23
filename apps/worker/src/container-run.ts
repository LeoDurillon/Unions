// Runs the commands users queue in tickets' and pull requests' workspaces, a few at a time.
import {
  claimContainerRun,
  finishContainerRun,
  MAX_OUTPUT_LINES,
  outputTail,
  recoverContainerRuns,
  updateContainerRunOutput,
  type ContainerRun,
  type ContainerRunOutcome,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { runIn } from './container-exec';
import { REPO_DIR, type ProvisionConfig } from './provision';
import { RunPool } from './run-pool';
import { openWorkspace } from './run-workspace';
import { RunSlots } from './slots';

/** Commands running at the same time, across workspaces (one per workspace, by the queue's rule). */
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

/**
 * Runs the command in its workspace (the ticket's container, or the pull request's), started for
 * it and stopped after unless something else runs there.
 */
async function execute(
  deps: ContainerRunDeps,
  run: ContainerRun,
  cancel: AbortSignal,
): Promise<ContainerRunOutcome> {
  const workspace = await openWorkspace(deps, run);
  if (!workspace) {
    const error = 'A step started in this workspace: run it once it ends';
    return { status: 'failed', exitCode: null, error, output: '' };
  }
  const { name } = workspace;
  const pidFile = { UNION_PID_FILE: `/tmp/union-run-${run.id}.pid` };
  const timeout = AbortSignal.timeout(run.timeoutSec * MS_PER_SEC);
  try {
    const exec = workspace.runtime.exec(name, ['setsid', '-w', 'sh', '-c', WRAPPER], {
      cwd: REPO_DIR,
      env: { ...workspace.env, ...pidFile, UNION_COMMAND: run.command },
      signal: AbortSignal.any([cancel, timeout]),
    });
    const result = await streamed(deps.db, run, exec);
    return outcomeOf(run, result, { cancel, timeout });
  } finally {
    await runIn(deps.runtime, name, ['sh', '-c', KILL], { env: pidFile }).catch(() => null);
    await workspace.release();
  }
}

/** Runs the commands users queue in tickets' and pull requests' workspaces, a few at a time. */
export class ContainerRunner extends RunPool<ContainerRun, ContainerRunOutcome> {
  constructor(private readonly deps: ContainerRunDeps) {
    super({
      slots: new RunSlots(MAX_PARALLEL),
      claim: () => claimContainerRun(deps.db),
      run: (run, signal) => execute(deps, run, signal),
      failed: (error) => ({ status: 'failed', exitCode: null, error, output: '' }),
      finish: (run, outcome) => {
        finishContainerRun(deps.db, run.id, outcome);
      },
    });
  }

  recover(): void {
    recoverContainerRuns(this.deps.db);
  }
}
