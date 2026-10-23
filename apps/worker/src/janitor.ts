// Removes the containers and volumes of deleted tickets; a failure is logged as an event, not
// thrown.
import { emitEvent, type ContainerRuntime, type Db } from '@union/core';

import type { ContainerRef } from './commands';

/**
 * Removes the containers and volumes of deleted tickets; a failure is logged as an event, not thrown.
 * `beforeRemove` runs first for each (a ticket's preview uses its workspace volume: it goes down
 * before the volume is removed).
 */
export async function removeContainers(
  db: Db,
  runtime: ContainerRuntime,
  containers: ContainerRef[],
  beforeRemove: (name: string) => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  for (const container of containers) {
    try {
      await beforeRemove(container.name);
      await runtime.remove(container.name, {
        home: container.home,
        workspace: container.workspace,
      });
    } catch (error) {
      emitEvent(db, {
        type: 'container_cleanup_failed',
        payload: {
          container: container.name,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
