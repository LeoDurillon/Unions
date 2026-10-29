// Resets a preview: its containers, volumes (the agent's services' included) and built images go,
// its images are built again without the cache, then it starts from nothing.
import {
  emitEvent,
  getTicket,
  ticketOwnerId,
  updatePreview,
  type WorkspaceOwner,
} from '@union/core';

import { syncProjectFiles } from '../project-files-sync';
import { compose } from './compose';
import { fileToRun } from './compose-file';
import { startOwnerPreview } from './review-preview';
import { outputLog, takeDown } from './run';
import {
  lastLines,
  loadTarget,
  PreviewError,
  projectDirectory,
  type PreviewDeps,
  type Target,
} from './target';
import { unionEnvFile } from './variables';

/** The images compose built for the project; pulled ones (`postgres:16`) stay. */
const REMOVE_BUILT_IMAGES = ['--rmi', 'local'];

const RESET_MESSAGE = 'Preview reset: its containers, volumes and built images were removed';

/** Builds the project's images again, every layer: a cached one may be what broke. */
async function buildFresh(deps: PreviewDeps, target: Target): Promise<void> {
  const log = outputLog(deps.db, target.owner);
  const output = await compose(deps.runtime, deps.settings, {
    args: [
      '-p',
      target.project,
      '--project-directory',
      projectDirectory(target),
      '-f',
      '-',
      'build',
      '--no-cache',
    ],
    workspaceVolume: target.workspaceVolume,
    stdin: JSON.stringify(await fileToRun(deps, target)),
    files: unionEnvFile(target),
    onLine: log.push,
  });
  log.flush();
  if (output.exitCode !== 0) {
    throw new PreviewError(`docker compose build failed:\n${lastLines(output.tail)}`);
  }
}

/** While a step runs, the agent's services are in use: their database would go under it. */
function stepRunning(deps: PreviewDeps, owner: WorkspaceOwner): boolean {
  const ticketId = ticketOwnerId(owner);
  return ticketId !== null && getTicket(deps.db, ticketId).phase.kind === 'running';
}

async function dropAndBuild(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  updatePreview(deps.db, owner, { status: 'stopping' });
  await takeDown(deps, owner, REMOVE_BUILT_IMAGES);
  const ticketId = ticketOwnerId(owner);
  if (ticketId !== null) {
    emitEvent(deps.db, { type: 'preview_reset', ticketId, payload: { message: RESET_MESSAGE } });
  }
  const target = loadTarget(deps, owner);
  updatePreview(deps.db, owner, { status: 'starting', error: null });
  await syncProjectFiles(deps.db, deps.runtime, target.projectId, {
    volume: target.workspaceVolume,
    image: deps.settings.image,
  });
  await buildFresh(deps, target);
}

/**
 * Removes everything the owner's compose project holds (containers, volumes, the images it built),
 * builds its images without the cache and starts it. The workspace, the code, is kept. Refused
 * while a step runs on the ticket.
 */
export async function resetPreview(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  const ticketId = ticketOwnerId(owner);
  if (stepRunning(deps, owner)) {
    if (ticketId !== null) {
      emitEvent(deps.db, {
        type: 'preview_busy',
        ticketId,
        payload: { message: 'A step is running on the ticket: reset the preview once it ends' },
      });
    }
    return;
  }
  try {
    await dropAndBuild(deps, owner);
  } catch (error) {
    updatePreview(deps.db, owner, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  await startOwnerPreview(deps, owner);
}
