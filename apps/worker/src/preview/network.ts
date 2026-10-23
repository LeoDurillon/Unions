// Puts the owner's container on its preview's networks, so the agent and the e2e command reach the
// services by name (`http://web:3000`): `t<id>.union.localhost` would be the container itself.
import {
  getPreview,
  ownerKey,
  PREVIEW_NETWORK,
  previewProject,
  type ContainerRuntime,
  type Db,
  type WorkspaceOwner,
} from '@union/core';

import { routeToPreview } from './host-routes';

/** The owner's own container (`union-t12`, the agent's; `union-r3`), which joins its preview to test it. */
function ownerContainer(owner: WorkspaceOwner): string {
  return `union-${ownerKey(owner)}`;
}

async function previewNetworks(
  runtime: ContainerRuntime,
  owner: WorkspaceOwner,
): Promise<string[]> {
  const networks = await runtime.projectNetworks(previewProject(owner));
  // The proxy's network is shared by every preview: the agent stays off it.
  return networks.filter((network) => network !== PREVIEW_NETWORK);
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

/** Before the preview goes down: Docker will not remove a network a container is still on. */
export async function leavePreview(
  runtime: ContainerRuntime,
  owner: WorkspaceOwner,
): Promise<void> {
  for (const network of await previewNetworks(runtime, owner)) {
    await runtime.disconnectNetwork(network, ownerContainer(owner));
  }
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
