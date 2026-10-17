import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  exposedServices,
  getTicket,
  recordE2e,
  replaceE2eScreenshots,
  schema,
  type ContainerRuntime,
  type Db,
  type PreviewConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { runIn } from './container-exec';
import { GATE_TIMEOUT_MS, tail } from './gate';
import { previewSettings } from './preview/compose';
import { startPreview, type PreviewDeps } from './preview/run';
import { ensureTicketContainer, REPO_DIR, type ProvisionConfig } from './provision';

/** Failure screenshots kept on the ticket: enough to see what broke, few enough to read. */
const MAX_SCREENSHOTS = 5;
/** `find -size` counts in 1 KiB blocks: 5 MiB. */
const MAX_SCREENSHOT_KIB = 5120;

export type E2eResult =
  | {
      status: 'green' | 'red';
      command: string;
      exitCode: number;
      tail: string;
      screenshots: number;
    }
  /** The preview cannot run now (no proxy, too many running): nothing the agent can fix. */
  | { status: 'skipped'; command: string; reason: string };

export type E2eRun = {
  db: Db;
  runtime: ContainerRuntime;
  ticketId: number;
  container: string;
  preview: PreviewConfig;
  signal?: AbortSignal;
  /** Tests replace the proxy's ready check. */
  previewOverrides?: Partial<PreviewDeps>;
};

/** The address of the first exposed service from inside the environment: `http://web:3000`. */
export function baseUrl(preview: PreviewConfig): string | null {
  const [first] = exposedServices(preview);
  return first ? `http://${first.name}:${first.port}` : null;
}

/**
 * The browser at the repository's own Playwright version, once: it is kept in the container's home
 * volume (the image has the system libraries). Repositories without Playwright are left alone.
 */
async function installBrowser(run: E2eRun): Promise<void> {
  await runIn(
    run.runtime,
    run.container,
    [
      'sh',
      '-lc',
      'if [ -x node_modules/.bin/playwright ]; then node_modules/.bin/playwright install chromium 2>&1; fi',
    ],
    { cwd: REPO_DIR, signal: run.signal },
  );
}

/** The newest failure screenshots of the run (Playwright writes them under `test-results`). */
async function screenshots(run: E2eRun): Promise<{ name: string; bytes: Uint8Array }[]> {
  const listed = await runIn(
    run.runtime,
    run.container,
    [
      'sh',
      '-c',
      `find test-results -name '*.png' -size -${MAX_SCREENSHOT_KIB}k 2>/dev/null | head -${MAX_SCREENSHOTS}`,
    ],
    { cwd: REPO_DIR },
  );
  const files = listed.stdout.split('\n').filter((line) => line.trim() !== '');
  if (files.length === 0) {
    return [];
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'union-e2e-'));
  try {
    const kept: { name: string; bytes: Uint8Array }[] = [];
    for (const [index, file] of files.entries()) {
      const local = path.join(dir, `${index}.png`);
      await run.runtime.copyOut(run.container, `${REPO_DIR}/${file}`, local);
      // `test-results/<test folder>/test-failed-1.png`: the folder names the test.
      kept.push({ name: `${path.basename(path.dirname(file))}.png`, bytes: await readFile(local) });
    }
    return kept;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The project's e2e command against the ticket's preview, after its checks passed. The preview is
 * started (or updated: `up --build` only rebuilds what changed) and the ticket's container joins
 * it; the command runs in the repository with `BASE_URL` (and `PREVIEW_URL`) set to the first
 * exposed service. A preview the code broke counts as red; one that cannot run now, as skipped.
 */
export async function runE2e(run: E2eRun): Promise<E2eResult | null> {
  const command = run.preview.e2eCommand;
  const url = baseUrl(run.preview);
  if (!command || !url) {
    return null;
  }
  const started = await startPreview(
    { db: run.db, runtime: run.runtime, settings: previewSettings(), ...run.previewOverrides },
    run.ticketId,
  );
  if (!started.ok) {
    return started.unavailable
      ? { status: 'skipped', command, reason: started.error }
      : {
          status: 'red',
          command,
          exitCode: 1,
          tail: `The preview did not start:\n${started.error}`,
          screenshots: 0,
        };
  }
  await installBrowser(run);
  const timeout = AbortSignal.timeout(GATE_TIMEOUT_MS);
  const result = await runIn(run.runtime, run.container, ['sh', '-lc', `${command} 2>&1`], {
    cwd: REPO_DIR,
    env: { BASE_URL: url, PREVIEW_URL: url },
    signal: run.signal ? AbortSignal.any([run.signal, timeout]) : timeout,
  });
  const green = result.exitCode === 0;
  const kept = green ? [] : await screenshots(run).catch(() => []);
  await replaceE2eScreenshots(run.db, run.ticketId, kept);
  return {
    status: green ? 'green' : 'red',
    command,
    exitCode: result.exitCode,
    tail: tail(result.stdout),
    screenshots: kept.length,
  };
}

function previewConfigOf(db: Db, projectId: number): PreviewConfig | undefined {
  return db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()?.config
    .preview;
}

/**
 * The e2e run the user asked for from the ticket: in the ticket's container (started for it, and
 * stopped after unless a step started meanwhile), against its preview. The result is kept on the
 * preview for the panel; the user decides whether to send a failure to the agent.
 */
export async function runRequestedE2e(
  deps: PreviewDeps & { config: ProvisionConfig },
  ticketId: number,
): Promise<void> {
  const { db, runtime } = deps;
  recordE2e(db, { ticketId }, { e2eStatus: 'running' });
  let container: string | null = null;
  try {
    const ticket = getTicket(db, ticketId);
    const preview = previewConfigOf(db, ticket.projectId);
    if (!preview?.e2eCommand) {
      recordE2e(
        db,
        { ticketId },
        {
          e2eStatus: 'skipped',
          e2eOutput: 'The project has no e2e command',
        },
      );
      return;
    }
    ({ name: container } = await ensureTicketContainer(db, runtime, deps.config, ticket));
    const result = await runE2e({
      db,
      runtime,
      ticketId,
      container,
      preview,
      previewOverrides: deps,
    });
    recordE2e(
      db,
      { ticketId },
      result === null || result.status === 'skipped'
        ? { e2eStatus: 'skipped', e2eOutput: result?.reason ?? 'Nothing to run' }
        : {
            e2eStatus: result.status,
            e2eOutput: result.tail,
            e2eExitCode: result.exitCode,
            e2eScreenshots: result.screenshots,
          },
    );
  } catch (error) {
    recordE2e(
      db,
      { ticketId },
      {
        e2eStatus: 'skipped',
        e2eOutput: error instanceof Error ? error.message : String(error),
      },
    );
  } finally {
    if (container && getTicket(db, ticketId).phase.kind !== 'running') {
      await runtime.stop(container).catch(() => null);
    }
  }
}
