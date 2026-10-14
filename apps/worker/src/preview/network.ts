import {
  getPreview,
  PREVIEW_NETWORK,
  previewProject,
  type ContainerRuntime,
  type Db,
} from '@union/core';

/** The ticket's own container: the agent's, which joins its preview to test it. */
function agentContainer(ticketId: number): string {
  return `union-t${ticketId}`;
}

async function previewNetworks(runtime: ContainerRuntime, ticketId: number): Promise<string[]> {
  const networks = await runtime.projectNetworks(previewProject(ticketId));
  // The proxy's network is shared by every preview: the agent stays off it.
  return networks.filter((network) => network !== PREVIEW_NETWORK);
}

/**
 * Puts the ticket's container on its preview's networks, so the agent and the e2e command reach the
 * services by name (`http://web:3000`): `<id>.localhost` would be the container itself. Best effort:
 * no agent container yet is not an error, it joins when it is provisioned.
 */
export async function joinPreview(runtime: ContainerRuntime, ticketId: number): Promise<void> {
  for (const network of await previewNetworks(runtime, ticketId)) {
    try {
      await runtime.connectNetwork(network, agentContainer(ticketId));
    } catch {
      // The container does not exist yet.
    }
  }
}

/** Before the preview goes down: Docker will not remove a network a container is still on. */
export async function leavePreview(runtime: ContainerRuntime, ticketId: number): Promise<void> {
  for (const network of await previewNetworks(runtime, ticketId)) {
    await runtime.disconnectNetwork(network, agentContainer(ticketId));
  }
}

/** When the ticket's container is (re)provisioned while its preview runs. */
export async function rejoinRunningPreview(
  db: Db,
  runtime: ContainerRuntime,
  ticketId: number,
): Promise<void> {
  if (getPreview(db, ticketId)?.status === 'running') {
    await joinPreview(runtime, ticketId);
  }
}
