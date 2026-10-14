import {
  activePreviews,
  emitEvent,
  getPreview,
  PREVIEW_NETWORK,
  previewProject,
  updatePreview,
  workspaceSubpaths,
  type ComposeJson,
  type Db,
} from '@union/core';

import { compose, createMountFolders } from './compose';
import { fileToRun } from './compose-file';
import { joinPreview, leavePreview } from './network';
import { waitReady } from './ready';
import {
  lastLines,
  loadTarget,
  PreviewError,
  projectDirectory,
  type PreviewDeps,
  type Target,
} from './target';

export { PreviewError, type PreviewDeps } from './target';

const READY_TIMEOUT_MS = 180_000;
const READY_INTERVAL_MS = 2000;
/** Output lines per `preview_output` event: a build prints thousands. */
const OUTPUT_BATCH = 25;

/** Sends the output to the ticket's log a batch at a time. */
function outputLog(db: Db, ticketId: number): { push: (line: string) => void; flush: () => void } {
  let lines: string[] = [];
  const flush = (): void => {
    if (lines.length > 0) {
      emitEvent(db, { type: 'preview_output', ticketId, payload: { lines } });
      lines = [];
    }
  };
  return {
    push: (line) => {
      lines.push(line);
      if (lines.length >= OUTPUT_BATCH) {
        flush();
      }
    },
    flush,
  };
}

async function up(deps: PreviewDeps, target: Target, file: ComposeJson): Promise<void> {
  await createMountFolders(
    deps.runtime,
    deps.settings,
    target.workspaceVolume,
    workspaceSubpaths(file),
  );
  const log = outputLog(deps.db, target.ticketId);
  const output = await compose(deps.runtime, deps.settings, {
    args: [
      '-p',
      target.project,
      '--project-directory',
      projectDirectory(target),
      '-f',
      '-',
      'up',
      '-d',
      '--build',
      '--remove-orphans',
    ],
    workspaceVolume: target.workspaceVolume,
    stdin: JSON.stringify(file),
    onLine: log.push,
  });
  log.flush();
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose up failed:\n${lastLines(output.tail)}`);
  }
}

/** The last lines the services printed; empty when they cannot be read. */
export async function serviceLogs(deps: PreviewDeps, ticketId: number): Promise<string> {
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', previewProject(ticketId), 'logs', '--no-color', '--tail', '200'],
  });
  return output.tail.join('\n');
}

export async function takeDown(deps: PreviewDeps, ticketId: number): Promise<void> {
  await leavePreview(deps.runtime, ticketId);
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', previewProject(ticketId), 'down', '-v', '--remove-orphans'],
  });
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose down failed:\n${lastLines(output.tail)}`);
  }
}

async function startTarget(deps: PreviewDeps, target: Target): Promise<void> {
  const others = activePreviews(deps.db).filter((row) => row.ticketId !== target.ticketId);
  if (others.length >= deps.settings.maxRunning) {
    throw new PreviewError(
      `${others.length} previews are running already (the limit): stop one first`,
      true,
    );
  }
  updatePreview(deps.db, target.ticketId, {
    status: 'starting',
    url: target.urls[0]?.url ?? null,
    urls: target.urls,
    error: null,
    startedAt: Date.now(),
  });
  if (!(await deps.runtime.networkExists(PREVIEW_NETWORK))) {
    throw new PreviewError(
      "The preview proxy is not running: it starts with Union's compose stack (bun run compose)",
      true,
    );
  }
  await up(deps, target, await fileToRun(deps, target));
  // All at once: each service gets the whole wait, not what the previous one left.
  const answered = await Promise.all(
    target.exposed.map((exposed) =>
      waitReady({
        proxyUrl: deps.settings.proxyUrl,
        host: exposed.host,
        timeoutMs: deps.readyTimeoutMs ?? READY_TIMEOUT_MS,
        intervalMs: deps.readyIntervalMs ?? READY_INTERVAL_MS,
        fetchFn: deps.fetchFn,
      }),
    ),
  );
  const silent = target.exposed.filter((_exposed, index) => answered[index] !== true);
  if (silent.length > 0) {
    throw new PreviewError(
      silent.map(({ service, port }) => `"${service}" did not answer on port ${port}`).join('\n'),
    );
  }
}

/** After a failed start: the services' last output, then nothing left running. */
async function cleanUp(deps: PreviewDeps, ticketId: number): Promise<string> {
  let logTail = '';
  try {
    logTail = await serviceLogs(deps, ticketId);
    await takeDown(deps, ticketId);
  } catch {
    // Best effort: the failure being reported matters more.
  }
  return logTail;
}

/** How a start ended; `unavailable`: the preview cannot run now, whatever the code (no settings, cap). */
export type StartOutcome = { ok: true } | { ok: false; error: string; unavailable: boolean };

/**
 * Starts (or updates) the ticket's preview from its workspace, and puts the ticket's container on
 * its networks. On any failure the reason and the services' last output are kept, and what was
 * started is taken down: a failed preview holds nothing.
 */
export async function startPreview(deps: PreviewDeps, ticketId: number): Promise<StartOutcome> {
  let loaded = false;
  try {
    const target = loadTarget(deps, ticketId);
    loaded = true;
    await startTarget(deps, target);
    await joinPreview(deps.runtime, ticketId);
    updatePreview(deps.db, ticketId, {
      status: 'running',
      logTail: await serviceLogs(deps, ticketId),
      logAt: Date.now(),
    });
    return { ok: true };
  } catch (error) {
    const logTail = loaded ? await cleanUp(deps, ticketId) : '';
    const message = error instanceof Error ? error.message : String(error);
    updatePreview(deps.db, ticketId, {
      status: 'failed',
      error: message,
      logTail: logTail === '' ? null : logTail,
      logAt: Date.now(),
    });
    return {
      ok: false,
      error: message,
      unavailable: !loaded || (error instanceof PreviewError && error.unavailable),
    };
  }
}

export async function stopPreview(deps: PreviewDeps, ticketId: number): Promise<void> {
  updatePreview(deps.db, ticketId, { status: 'stopping' });
  try {
    await takeDown(deps, ticketId);
    updatePreview(deps.db, ticketId, { status: 'stopped', error: null });
  } catch (error) {
    updatePreview(deps.db, ticketId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Refreshes the services' last output on the panel. */
export async function refreshPreviewLogs(deps: PreviewDeps, ticketId: number): Promise<void> {
  const row = getPreview(deps.db, ticketId);
  if (!row) {
    return;
  }
  updatePreview(deps.db, ticketId, {
    status: row.status,
    logTail: await serviceLogs(deps, ticketId),
    logAt: Date.now(),
  });
}
