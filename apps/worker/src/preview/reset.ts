// Resets a preview: its containers, volumes (the agent's services' included) and built images go,
// the data folders chosen are emptied, its images are built again without the cache, then it starts
// from nothing. A finished ticket's preview is taken down the same way, for good.
import {
  emitEvent,
  getPreview,
  getTicket,
  ticketOwnerId,
  updatePreview,
  type WorkspaceOwner,
} from '@union/core';

import { syncProjectFiles } from '../project-files-sync';
import { compose } from './compose';
import { fileToRun } from './compose-file';
import { outputLog } from './compose-up';
import { emptyDataFolders } from './data-folders';
import { startOwnerPreview } from './review-preview';
import { takeDown } from './run';
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

function resetMessage(emptied: string[]): string {
  return emptied.length === 0
    ? RESET_MESSAGE
    : `${RESET_MESSAGE}, and ${emptied.join(', ')} emptied`;
}

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

async function dropAndBuild(
  deps: PreviewDeps,
  owner: WorkspaceOwner,
  folders: string[],
): Promise<void> {
  updatePreview(deps.db, owner, { status: 'stopping' });
  await takeDown(deps, owner, REMOVE_BUILT_IMAGES);
  const target = loadTarget(deps, owner);
  const emptied = await emptyDataFolders(deps, target, folders);
  const ticketId = ticketOwnerId(owner);
  if (ticketId !== null) {
    const message = resetMessage(emptied);
    emitEvent(deps.db, { type: 'preview_reset', ticketId, payload: { message } });
  }
  updatePreview(deps.db, owner, { status: 'starting', error: null });
  await syncProjectFiles(deps.db, deps.runtime, target.projectId, {
    volume: target.workspaceVolume,
    image: deps.settings.image,
  });
  await buildFresh(deps, target);
}

/**
 * Removes everything the owner's compose project holds (containers, volumes, the images it built),
 * empties the chosen `folders` among the data folders found at its last start, builds its images
 * without the cache and starts it. The code is kept. Refused while a step runs on the ticket.
 */
export async function resetPreview(
  deps: PreviewDeps,
  owner: WorkspaceOwner,
  folders: string[] = [],
): Promise<void> {
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
    await dropAndBuild(deps, owner, folders);
  } catch (error) {
    updatePreview(deps.db, owner, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  await startOwnerPreview(deps, owner);
}

/**
 * Takes a finished ticket's preview down for good: its containers, networks, volumes and built
 * images (pulled ones stay). Its row, when it has one, says stopped without its last error.
 */
export async function removeFinishedPreview(
  deps: PreviewDeps,
  owner: WorkspaceOwner,
): Promise<void> {
  await takeDown(deps, owner, REMOVE_BUILT_IMAGES);
  if (getPreview(deps.db, owner) !== null) {
    updatePreview(deps.db, owner, { status: 'stopped', error: null });
  }
}
