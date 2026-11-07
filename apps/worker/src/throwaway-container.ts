// Runs work in a throwaway container from the agent image, with only the Claude login, removed after.
import { emitEvent, type ContainerRuntime, type Db } from '@union/core';

import {
  projectImage,
  seedCredentials,
  type ProvisionConfig,
  type TicketContainer,
} from './provision';

export type ThrowawayDeps = {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  /** The project whose agent image the container runs; absent: the base image (no repository work). */
  projectId?: number;
};

/** Removes the container and its volumes; a failure is logged (on the investigation, if any), not thrown. */
export async function removeThrowaway(
  deps: ThrowawayDeps,
  names: TicketContainer,
  investigationId?: number,
): Promise<void> {
  try {
    await deps.runtime.remove(names.name, {
      home: names.homeVolume,
      workspace: names.workspaceVolume,
    });
  } catch (error) {
    emitEvent(deps.db, {
      type: 'container_cleanup_failed',
      investigationId,
      payload: {
        container: names.name,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Starts the container with the Claude login, runs `work` in it, and removes it whatever happened.
 * What a stopped worker left under the same name is removed first.
 */
export async function inThrowaway<T>(
  deps: ThrowawayDeps,
  names: TicketContainer,
  work: (container: string) => Promise<T>,
  investigationId?: number,
): Promise<T> {
  const { runtime, config } = deps;
  await runtime
    .remove(names.name, { home: names.homeVolume, workspace: names.workspaceVolume })
    .catch(() => null);
  try {
    const image =
      deps.projectId === undefined ? config.image : await projectImage(config, deps.projectId);
    await runtime.create({ ...names, image });
    await runtime.start(names.name);
    await seedCredentials(runtime, names.name, config.credentialsPath);
    return await work(names.name);
  } finally {
    await removeThrowaway(deps, names, investigationId);
  }
}
