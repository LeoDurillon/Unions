// Runs the project's e2e command against the owner's preview, after its checks passed.

import {
  replaceE2eScreenshots,
  replaceReviewScreenshots,
  type ContainerRuntime,
  type Db,
  type PreviewConfig,
  type WorkspaceOwner,
} from '@union/core';

import { runIn } from '../container-exec';
import { GATE_TIMEOUT_MS, tail } from '../gate';
import { REPO_DIR } from '../provision';
import { workerPreviewSettings } from './compose';
import { collectScreenshots, type Screenshot, type Screenshots } from './e2e-screenshots';
import { baseUrl, previewEnv } from './preview-env';
import { startPreview, type PreviewDeps } from './run';

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

/** A ticket's go with its files (the final review reads them); a pull request's, with its preview. */
function keepScreenshots(db: Db, owner: WorkspaceOwner, files: Screenshot[]): Promise<void> {
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
    {
      db: run.db,
      runtime: run.runtime,
      settings: workerPreviewSettings(run.db),
      ...run.previewOverrides,
    },
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
  // Grouped, so every line of a multi-line command writes its errors to the output.
  const result = await runIn(run.runtime, run.container, ['sh', '-lc', `{ ${command}\n} 2>&1`], {
    cwd: REPO_DIR,
    env: previewEnv(run.db, run.owner),
    signal: run.signal ? AbortSignal.any([run.signal, timeout]) : timeout,
  });
  const green = result.exitCode === 0;
  const none: Screenshots = { kept: [], skipped: [] };
  const { kept, skipped } = green
    ? none
    : await collectScreenshots(run.runtime, run.container).catch(() => none);
  await keepScreenshots(run.db, run.owner, kept);
  return {
    status: green ? 'green' : 'red',
    command,
    exitCode: result.exitCode,
    tail: [tail(result.stdout), ...skipped].join('\n'),
    screenshots: kept.length,
  };
}
