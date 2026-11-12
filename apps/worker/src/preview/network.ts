// Puts the owner's container on its preview's networks, so the agent and the e2e command reach the
// services by name. That is `http://web:3000`: `t<id>.union.localhost` would be the container
// itself.
import {
  getPreview,
  ownerKey,
  PREVIEW_NETWORK,
  previewProject,
  previewProxyNetwork,
  type ContainerRuntime,
  type Db,
  type WorkspaceOwner,
} from '@union/core';

import { routeToPreview } from './host-routes';
import { leaveProxy } from './proxy-network';
import { leaveShared, type SharedDeps } from './shared-stack';

export { joinProxy } from './proxy-network';

/** The owner's own container (`union-t12`, the agent's; `union-r3`), which joins its preview to test it. */
function ownerContainer(owner: WorkspaceOwner): string {
  return `union-${ownerKey(owner)}`;
}

async function previewNetworks(
  runtime: ContainerRuntime,
  owner: WorkspaceOwner,
): Promise<string[]> {
  const project = previewProject(owner);
  const networks = await runtime.projectNetworks(project);
  // The proxy's networks are for the proxy: the agent reaches the services on the others.
  return networks.filter(
    (network) => network !== PREVIEW_NETWORK && network !== previewProxyNetwork(project),
  );
}

/**
 * Puts the owner's container on its preview's networks, so the agent and the e2e command reach the
 * services by name (`http://web:3000`): `t<id>.union.localhost` would be the container itself. Best effort:
 * no agent container yet is not an error, it joins when it is provisioned.
 */
export async function joinPreview(runtime: ContainerRuntime, owner: WorkspaceOwner): Promise<void> {
  for (const network of await previewNetworks(runtime, owner)) {
    try {
      await runtime.connectNetwork(network, ownerContainer(owner));
    } catch {
      // The container does not exist yet.
    }
  }
}

/**
 * Before the preview goes down, the owner's container, the proxy and the shared services leave its
 * networks: Docker will not remove a network a container is still on.
 */
export async function leavePreview(deps: SharedDeps, owner: WorkspaceOwner): Promise<void> {
  for (const network of await previewNetworks(deps.runtime, owner)) {
    await deps.runtime.disconnectNetwork(network, ownerContainer(owner));
  }
  await leaveProxy(deps.runtime, previewProject(owner));
  await leaveShared(deps, previewProject(owner), ownerContainer(owner));
}

/** When the ticket's container is (re)provisioned while its preview runs: its networks and addresses. */
export async function rejoinRunningPreview(
  db: Db,
  runtime: ContainerRuntime,
  ticketId: number,
): Promise<void> {
  if (getPreview(db, { ticketId })?.status === 'running') {
    await joinPreview(runtime, { ticketId });
    await routeToPreview(db, runtime, { ticketId });
  }
}
