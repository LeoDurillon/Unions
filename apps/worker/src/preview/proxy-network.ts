// Puts Union's proxy on a preview's own proxy network after `up`, and takes it off before `down`:
// the exposed services share that network with the proxy only, never with another preview.
import { PREVIEW_NETWORK, previewProxyNetwork, type ContainerRuntime } from '@union/core';

/** A preview's container (`union-t12-proxy-1`): until Union's own previews moved off the shared network, one could be named `proxy`. */
const PREVIEW_CONTAINER = /^union-[rt]\d+-/u;

/** The Traefik container of Union's compose stack: the `proxy` service on the shared network. */
async function proxyContainers(runtime: ContainerRuntime): Promise<string[]> {
  const found = await runtime.serviceContainers(PREVIEW_NETWORK, 'proxy');
  return found.filter((name) => !PREVIEW_CONTAINER.test(name));
}

/** After `up`: compose made the network if a service is exposed; without the proxy on it, none answers. */
export async function joinProxy(runtime: ContainerRuntime, project: string): Promise<void> {
  const network = previewProxyNetwork(project);
  if (!(await runtime.networkExists(network))) {
    return;
  }
  const proxies = await proxyContainers(runtime);
  if (proxies.length === 0) {
    throw new Error(`The preview proxy's container is not on the ${PREVIEW_NETWORK} network`);
  }
  for (const proxy of proxies) {
    await runtime.connectNetwork(network, proxy);
  }
}

/** Before `down`: Docker will not remove a network a container is still on. */
export async function leaveProxy(runtime: ContainerRuntime, project: string): Promise<void> {
  const network = previewProxyNetwork(project);
  if (!(await runtime.networkExists(network))) {
    return;
  }
  for (const proxy of await proxyContainers(runtime)) {
    await runtime.disconnectNetwork(network, proxy);
  }
}
