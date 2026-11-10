// The services a project's previews share (`union-p<id>-shared`): brought up for a preview or the
// agent, joined to its networks under their service names, and taken down once nothing uses them.
import {
  isRecord,
  PREVIEW_NETWORK,
  previewProxyNetwork,
  previewServiceLimits,
  SHARED_CONTAINER,
  sharedNetwork,
  sharedPart,
  sharedProject,
  sharedStackFile,
  withResourceCaps,
  type ComposeJson,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import { compose, type PreviewSettings } from './compose';

/** What the shared stack needs of a preview's dependencies (`SharedDeps` has them). */
export type SharedDeps = { db: Db; runtime: ContainerRuntime; settings: PreviewSettings };

/** How long the shared services get to be healthy. */
const WAIT_SECONDS = 180;
/** The lines of compose's output a failure quotes. */
const REASON_LINES = 20;
/** A shared container's project, from its name (`union-p3-shared-clamav-1`) or its network's. */
const SHARED_PROJECT_ID = /^union-p(?<id>\d+)-shared[-_]/u;

const queues = new Map<number, Promise<unknown>>();

/** One start, join or release at a time per project: a release must not take down what a start joins. */
function serialized<T>(projectId: number, work: () => Promise<T>): Promise<T> {
  const before = queues.get(projectId);
  const next = (async (): Promise<T> => {
    try {
      await before;
    } catch {
      // The one before failed: its caller was told, this one runs anyway.
    }
    return work();
  })();
  queues.set(projectId, next);
  return next;
}

/** A compose project's networks an outside container joins: not the proxy's. */
async function serviceNetworks(deps: SharedDeps, project: string): Promise<string[]> {
  const networks = await deps.runtime.projectNetworks(project);
  return networks.filter(
    (network) => network !== PREVIEW_NETWORK && network !== previewProxyNetwork(project),
  );
}

/** Brings the shared services up, leaving running ones as they are; their containers by service. */
async function upShared(
  deps: SharedDeps,
  projectId: number,
  stack: ComposeJson,
): Promise<{ service: string; container: string }[]> {
  const project = sharedProject(projectId);
  const output = await compose(deps.runtime, deps.settings, {
    args: [
      '-p',
      project,
      '-f',
      '-',
      'up',
      '-d',
      '--no-recreate',
      '--wait',
      '--wait-timeout',
      String(WAIT_SECONDS),
    ],
    stdin: JSON.stringify(withResourceCaps(stack, previewServiceLimits(deps.db, project))),
  });
  if (output.exitCode !== 0) {
    const reason = output.tail.slice(-REASON_LINES).join('\n');
    throw new Error(`The shared services did not start:\n${reason}`);
  }
  const services = isRecord(stack.services) ? Object.keys(stack.services) : [];
  const found = await Promise.all(
    services.map(async (service) => ({
      service,
      containers: await deps.runtime.serviceContainers(sharedNetwork(projectId), service),
    })),
  );
  return found.flatMap(({ service, containers }) =>
    containers.map((container) => ({ service, container })),
  );
}

/**
 * Before a preview's (or the agent's) services start: the shared ones up, and on each of the compose
 * project's networks under their service names. `agent`: the ticket's container also joins the
 * shared network, for the agent services when the ticket's project has no network of its own.
 */
export async function joinShared(
  deps: SharedDeps,
  target: { projectId: number; project: string },
  file: ComposeJson,
  agent?: string,
): Promise<void> {
  const stack = sharedStackFile(file, target.projectId);
  if (stack === null) {
    return;
  }
  await serialized(target.projectId, async () => {
    const containers = await upShared(deps, target.projectId, stack);
    for (const network of await serviceNetworks(deps, target.project)) {
      for (const { service, container } of containers) {
        await deps.runtime.connectNetwork(network, container, [service]);
      }
    }
    if (agent !== undefined) {
      await deps.runtime.connectNetwork(sharedNetwork(target.projectId), agent);
    }
  });
}

/** The project a shared container or network belongs to. */
function projectIdOf(name: string): number | null {
  const id = SHARED_PROJECT_ID.exec(name)?.groups?.id;
  return id === undefined ? null : Number(id);
}

/** Takes the project's shared services down (data kept) when no preview and no ticket's container uses them. */
async function releaseIfUnused(deps: SharedDeps, projectId: number): Promise<void> {
  const project = sharedProject(projectId);
  const onShared = await deps.runtime.networkContainers(sharedNetwork(projectId));
  if (onShared.length === 0 || onShared.some((name) => !name.startsWith(`${project}-`))) {
    return;
  }
  const own = new Set(await deps.runtime.projectNetworks(project));
  for (const container of onShared) {
    const networks = await deps.runtime.containerNetworks(container);
    if (networks.some((network) => !own.has(network))) {
      return;
    }
  }
  await compose(deps.runtime, deps.settings, { args: ['-p', project, 'down', '--remove-orphans'] });
}

/**
 * Before a compose project goes down: the shared containers leave its networks (Docker removes no
 * network a container is on) and `owner` (its ticket's or pull request's container) the shared
 * network; then each project's shared services go down if nothing else uses them.
 */
export async function leaveShared(deps: SharedDeps, project: string, owner: string): Promise<void> {
  const released = new Set<number>();
  for (const network of await serviceNetworks(deps, project)) {
    for (const container of await deps.runtime.networkContainers(network)) {
      const projectId = SHARED_CONTAINER.test(container) ? projectIdOf(container) : null;
      if (projectId !== null) {
        released.add(projectId);
        await deps.runtime.disconnectNetwork(network, container);
      }
    }
  }
  for (const network of await deps.runtime.containerNetworks(owner)) {
    const projectId = projectIdOf(network);
    if (projectId !== null && network === sharedNetwork(projectId)) {
      released.add(projectId);
      await deps.runtime.disconnectNetwork(network, owner);
    }
  }
  for (const projectId of released) {
    await serialized(projectId, () => releaseIfUnused(deps, projectId));
  }
}

/** The file with the shared services beside the others: the agent's `localhost` forwards read their ports. */
export function withSharedServices(file: ComposeJson): ComposeJson {
  const part = sharedPart(file);
  const services = isRecord(file.services) ? file.services : {};
  return part === null ? file : { ...file, services: { ...services, ...part.services } };
}
