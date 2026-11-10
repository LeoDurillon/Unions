// What the user asks of a project's shared services from the Environments tab: restart them, or
// take them down (their data kept) when no preview of the project runs.
import { activePreviews, SHARED_CONTAINER, sharedNetwork, sharedProject } from '@union/core';

import type { SharedAction } from '../command-hooks';
import { compose } from './compose';
import { serialized } from './shared-stack';
import { recordShared, type SharedDeps } from './shared-state';

export { SharedWatcher } from './shared-state';

/** The lines of compose's output a failure quotes. */
const REASON_LINES = 20;

async function composeIn(deps: SharedDeps, projectId: number, args: string[]): Promise<void> {
  const output = await compose(deps.runtime, deps.settings, {
    args: ['-p', sharedProject(projectId), ...args],
  });
  if (output.exitCode !== 0) {
    throw new Error(
      `docker compose ${args[0] ?? ''} failed:\n${output.tail.slice(-REASON_LINES).join('\n')}`,
    );
  }
}

/** Runs `work` on the project's stack, then records how it is; a failure is recorded with it. */
async function act(deps: SharedDeps, projectId: number, work: () => Promise<void>): Promise<void> {
  try {
    await serialized(projectId, work);
  } catch (error) {
    await recordShared(deps, projectId, error instanceof Error ? error.message : String(error));
    return;
  }
  await recordShared(deps, projectId);
}

/** Restarts the shared containers: they keep their networks, so the previews find them again. */
export async function restartShared(deps: SharedDeps, projectId: number): Promise<void> {
  await act(deps, projectId, () => composeIn(deps, projectId, ['restart']));
}

/**
 * Takes the shared services down, their volumes kept: the tickets' containers leave their network
 * first, and the shared containers any other. Refused while a preview of the project runs.
 */
export async function stopShared(deps: SharedDeps, projectId: number): Promise<void> {
  await act(deps, projectId, async () => {
    if (activePreviews(deps.db).some((preview) => preview.projectId === projectId)) {
      throw new Error('A preview of the project uses them: stop it first');
    }
    const network = sharedNetwork(projectId);
    const onNetwork = await deps.runtime.networkContainers(network);
    for (const ticket of onNetwork.filter((name) => !SHARED_CONTAINER.test(name))) {
      await deps.runtime.disconnectNetwork(network, ticket);
    }
    const own = new Set(await deps.runtime.projectNetworks(sharedProject(projectId)));
    for (const container of onNetwork.filter((name) => SHARED_CONTAINER.test(name))) {
      for (const other of await deps.runtime.containerNetworks(container)) {
        if (!own.has(other)) {
          await deps.runtime.disconnectNetwork(other, container);
        }
      }
    }
    await composeIn(deps, projectId, ['down', '--remove-orphans']);
  });
}

/** What the user asked for. */
export function sharedWork(
  action: SharedAction,
): (deps: SharedDeps, projectId: number) => Promise<void> {
  return action === 'restart' ? restartShared : stopShared;
}
