import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  replaceE2eScreenshots,
  replaceReviewScreenshots,
  type ContainerRuntime,
  type Db,
  type PreviewConfig,
  type WorkspaceOwner,
} from '@union/core';

import { runIn } from './container-exec';
import { GATE_TIMEOUT_MS, tail } from './gate';
import { baseUrl, previewEnv } from './preview-env';
import { previewSettings } from './preview/compose';
import { startPreview, type PreviewDeps } from './preview/run';
import { REPO_DIR } from './provision';

/** Failure screenshots kept: enough to see what broke, few enough to read. */
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
  owner: WorkspaceOwner;
  container: string;
  preview: PreviewConfig;
  signal?: AbortSignal;
  /** Tests replace the proxy's ready check. */
  previewOverrides?: Partial<PreviewDeps>;
};

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

/** A ticket's go with its files (the final review reads them); a pull request's, with its preview. */
function keepScreenshots(
  db: Db,
  owner: WorkspaceOwner,
  files: { name: string; bytes: Uint8Array }[],
): Promise<void> {
  return 'ticketId' in owner
    ? replaceE2eScreenshots(db, owner.ticketId, files)
    : replaceReviewScreenshots(db, owner.reviewId, files);
}

/**
 * The project's e2e command against the owner's preview, after its checks passed. The preview is
 * started (or updated: `up --build` only rebuilds what changed) and the owner's container joins
 * it; the command runs in the repository with `BASE_URL` (and `PREVIEW_URL`) set to the first
 * exposed service by name, and `UNION_URL_<SERVICE>` to each one's public address. A preview the code broke counts as red; one that cannot run now, as skipped.
 */
export async function runE2e(run: E2eRun): Promise<E2eResult | null> {
  const command = run.preview.e2eCommand;
  const url = baseUrl(run.preview);
  if (!command || !url) {
    return null;
  }
  const started = await startPreview(
    { db: run.db, runtime: run.runtime, settings: previewSettings(), ...run.previewOverrides },
    run.owner,
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
    env: previewEnv(run.db, run.owner),
    signal: run.signal ? AbortSignal.any([run.signal, timeout]) : timeout,
  });
  const green = result.exitCode === 0;
  const kept = green ? [] : await screenshots(run).catch(() => []);
  await keepScreenshots(run.db, run.owner, kept);
  return {
    status: green ? 'green' : 'red',
    command,
    exitCode: result.exitCode,
    tail: tail(result.stdout),
    screenshots: kept.length,
  };
}
