// Starts and stops a preview from its owner's workspace, and reads the services' last output.
import {
  activePreviews,
  getPreview,
  getTicket,
  PREVIEW_NETWORK,
  previewProject,
  updatePreview,
  ownerKey,
  previewOwner,
  ticketOwnerId,
  type WorkspaceOwner,
} from '@union/core';

import { syncProjectFiles } from '../project-files-sync';
import { compose } from './compose';
import { fileToRun } from './compose-file';
import { up } from './compose-up';
import { routeToPreview } from './host-routes';
import { joinPreview, joinProxy, leavePreview } from './network';
import { proxyAnswers, waitReady } from './ready';
import { dropSharedData } from './shared-data';
import { lastLines, loadTarget, PreviewError, type PreviewDeps, type Target } from './target';

export type { PreviewDeps } from './target';

const READY_TIMEOUT_MS = 180_000;
const CANCELLED = 'The start was cancelled';
const READY_INTERVAL_MS = 2000;
/** How long the proxy gets to answer before a start, when it runs. */
const PROXY_CHECK_MS = 3000;
/** The last lines the services printed; empty when they cannot be read. */
export async function serviceLogs(deps: PreviewDeps, owner: WorkspaceOwner): Promise<string> {
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', previewProject(owner), 'logs', '--no-color', '--tail', '200'],
  });
  return output.tail.join('\n');
}

/** `compose down` with `flags`, once the owner's container and the proxy left its networks. */
async function down(deps: PreviewDeps, owner: WorkspaceOwner, flags: string[]): Promise<void> {
  await leavePreview(deps, owner);
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', previewProject(owner), 'down', ...flags],
  });
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose down failed:\n${lastLines(output.tail)}`);
  }
}

/** Removes the compose project's containers, networks and volumes; `extra` adds to `down` (`--rmi local`). */
export async function takeDown(
  deps: PreviewDeps,
  owner: WorkspaceOwner,
  extra: string[] = [],
): Promise<void> {
  await dropSharedData(deps, owner);
  await down(deps, owner, ['-v', '--remove-orphans', ...extra]);
}

/**
 * Removes the compose project's containers and networks, keeping its volumes and so its data: a
 * stopped preview holds no network (Docker has room for about 30), and a start creates them again.
 */
export async function bringDown(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  await down(deps, owner, ['--remove-orphans']);
}

/** Refuses a start the proxy could not serve: without it no service ever answers. */
async function ensureProxy(deps: PreviewDeps): Promise<void> {
  const running =
    (await deps.runtime.networkExists(PREVIEW_NETWORK)) &&
    (await proxyAnswers(deps.settings.proxyUrl, PROXY_CHECK_MS, deps.fetchFn));
  if (!running) {
    throw new PreviewError(
      "The preview proxy is not running: it starts with Union's compose stack (bun run compose, or docker compose up -d proxy)",
      true,
    );
  }
}

async function startTarget(deps: PreviewDeps, target: Target): Promise<void> {
  const self = ownerKey(target.owner);
  const others = activePreviews(deps.db).filter((row) => ownerKey(previewOwner(row)) !== self);
  if (others.length >= deps.settings.maxRunning) {
    throw new PreviewError(
      `${others.length} previews are running already (the limit): stop one first`,
      true,
    );
  }
  const projectCap = target.config.maxRunning;
  const sameProject = others.filter((row) => row.projectId === target.projectId);
  if (projectCap !== undefined && sameProject.length >= projectCap) {
    throw new PreviewError(
      `${sameProject.length} of the project's previews are running already (its limit, Environments → Limits): stop one first`,
      true,
    );
  }
  updatePreview(deps.db, target.owner, {
    status: 'starting',
    url: target.urls[0]?.url ?? null,
    urls: target.urls,
    error: null,
    startedAt: Date.now(),
  });
  await ensureProxy(deps);
  await syncProjectFiles(deps.db, deps.runtime, target.projectId, {
    volume: target.workspaceVolume,
    image: deps.settings.image,
  });
  const file = await fileToRun(deps, target);
  await up(deps, target, file);
  await joinProxy(deps.runtime, target.project);
  // All at once: each service gets the whole wait, not what the previous one left.
  const answered = await Promise.all(
    target.exposed.map((exposed) =>
      waitReady({
        proxyUrl: deps.settings.proxyUrl,
        host: exposed.host,
        timeoutMs: deps.readyTimeoutMs ?? READY_TIMEOUT_MS,
        intervalMs: deps.readyIntervalMs ?? READY_INTERVAL_MS,
        fetchFn: deps.fetchFn,
        signal: deps.signal,
      }),
    ),
  );
  if (deps.signal?.aborted === true) {
    throw new PreviewError(CANCELLED);
  }
  const silent = target.exposed.filter((_exposed, index) => answered[index] !== true);
  if (silent.length > 0) {
    throw new PreviewError(
      silent.map(({ service, port }) => `"${service}" did not answer on port ${port}`).join('\n'),
    );
  }
}

/** After a failed start: the services' last output, then nothing left running. */
async function cleanUp(deps: PreviewDeps, owner: WorkspaceOwner): Promise<string> {
  let logTail = '';
  try {
    logTail = await serviceLogs(deps, owner);
    await takeDown(deps, owner);
  } catch {
    // Best effort: the failure being reported matters more.
  }
  return logTail;
}

/** How a start ended; `unavailable`: the preview cannot run now, whatever the code (no settings, cap). */
export type StartOutcome = { ok: true } | { ok: false; error: string; unavailable: boolean };

/**
 * Starts (or updates) the owner's preview from its workspace, and puts the owner's container (the
 * ticket's, or the pull request's) on its networks, answering at the preview's addresses. On any failure the reason and the services' last output are kept, and what was
 * started is taken down: a failed preview holds nothing.
 */
export async function startPreview(
  deps: PreviewDeps,
  owner: WorkspaceOwner,
): Promise<StartOutcome> {
  let loaded = false;
  try {
    const target = loadTarget(deps, owner);
    loaded = true;
    await startTarget(deps, target);
    await joinPreview(deps.runtime, owner);
    updatePreview(deps.db, owner, {
      status: 'running',
      logTail: await serviceLogs(deps, owner),
      logAt: Date.now(),
    });
    await routeToPreview(deps.db, deps.runtime, owner);
    return { ok: true };
  } catch (error) {
    const logTail = loaded ? await cleanUp(deps, owner) : '';
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = deps.signal?.aborted === true;
    updatePreview(deps.db, owner, {
      status: cancelled ? 'stopped' : 'failed',
      error: cancelled ? null : message,
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

/**
 * While a step runs with the agent's services (a database for its tests), stopping the preview
 * removes only what the proxy serves: the agent keeps its services until the step ends.
 */
async function stopExposedOnly(deps: PreviewDeps, owner: WorkspaceOwner): Promise<boolean> {
  const ticketId = ticketOwnerId(owner);
  if (ticketId === null) {
    return false;
  }
  const target = loadTarget(deps, owner);
  const keep = target.config.agentServices ?? [];
  if (keep.length === 0 || getTicket(deps.db, ticketId).phase.kind !== 'running') {
    return false;
  }
  const exposed = target.exposed
    .map(({ service }) => service)
    .filter((name) => !keep.includes(name));
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', target.project, 'rm', '--stop', '--force', ...exposed],
  });
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose rm failed:\n${lastLines(output.tail)}`);
  }
  return true;
}

export async function stopPreview(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  updatePreview(deps.db, owner, { status: 'stopping' });
  try {
    if (!(await stopExposedOnly(deps, owner))) {
      await takeDown(deps, owner);
    }
    updatePreview(deps.db, owner, { status: 'stopped', error: null });
  } catch (error) {
    updatePreview(deps.db, owner, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Refreshes the services' last output on the panel. */
export async function refreshPreviewLogs(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  const row = getPreview(deps.db, owner);
  if (!row) {
    return;
  }
  updatePreview(deps.db, owner, {
    status: row.status,
    logTail: await serviceLogs(deps, owner),
    logAt: Date.now(),
  });
}
