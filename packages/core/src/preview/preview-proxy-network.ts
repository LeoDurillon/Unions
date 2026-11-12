// The network one preview's exposed services share with the proxy, and with no other preview. On a
// network every preview joins, a service name (`s3`) answers from every preview that has one.
import {
  isRecord,
  PREVIEW_NETWORK,
  PREVIEW_NETWORK_KEY,
  type ComposeJson,
} from './preview-compose-check';

const TRAEFIK_NETWORK_LABEL = 'traefik.docker.network';

/** The preview's proxy network: made by its compose project, the proxy joins it after `up`. */
export function previewProxyNetwork(project: string): string {
  return `${project}-proxy`;
}

function withProxyLabel(service: unknown, network: string): unknown {
  if (!isRecord(service) || !isRecord(service.labels)) {
    return service;
  }
  const label = service.labels[TRAEFIK_NETWORK_LABEL];
  return label === PREVIEW_NETWORK
    ? { ...service, labels: { ...service.labels, [TRAEFIK_NETWORK_LABEL]: network } }
    : service;
}

/**
 * A file the user edited from one Union wrote before previews had their own proxy network: its
 * services move from the shared network (`union-preview`) to the preview's.
 */
export function withProxyNetwork(config: ComposeJson, project: string): ComposeJson {
  const networks = isRecord(config.networks) ? config.networks : {};
  const shared = networks[PREVIEW_NETWORK_KEY];
  if (!isRecord(shared) || shared.name !== PREVIEW_NETWORK) {
    return config;
  }
  const network = previewProxyNetwork(project);
  const services = isRecord(config.services) ? config.services : {};
  return {
    ...config,
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => [name, withProxyLabel(service, network)]),
    ),
    networks: { ...networks, [PREVIEW_NETWORK_KEY]: { name: network } },
  };
}
