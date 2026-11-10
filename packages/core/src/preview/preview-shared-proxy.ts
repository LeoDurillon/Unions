// The web pages of a project's shared services, opened by the proxy at one address per project
// (`s3-p1.union.localhost`), on a network only the proxy and those services share.
import { isRecord, PREVIEW_NETWORK_KEY, type ComposeJson } from './preview-compose-check';
import { PREVIEW_DOMAIN, previewAddress } from './preview-config';
import { previewProxyNetwork } from './preview-proxy-network';
import { sharedProject } from './preview-shared';

const NOT_IN_HOST = /[^a-z0-9-]+/gu;

/** A shared service the proxy opens, on the port its web page answers on. */
export type SharedOpened = { service: string; port: number };

/** `s3-p1.union.localhost`: the service's name as a host label, then the project. */
export function sharedServiceHost(projectId: number, service: string): string {
  const label = service.toLowerCase().replaceAll(NOT_IN_HOST, '-');
  return `${label}-p${projectId}.${PREVIEW_DOMAIN}`;
}

/** Where each opened service answers, for the services that run. */
export function sharedUrls(
  projectId: number,
  opened: readonly SharedOpened[],
  running: readonly string[],
  publicPort: number,
): { service: string; url: string }[] {
  return opened
    .filter(({ service }) => running.includes(service))
    .map(({ service }) => ({
      service,
      url: previewAddress(sharedServiceHost(projectId, service), publicPort),
    }));
}

function routing(projectId: number, opened: SharedOpened): Record<string, string> {
  const project = sharedProject(projectId);
  const router = `${project}-${opened.service}`;
  return {
    'traefik.enable': 'true',
    'traefik.docker.network': previewProxyNetwork(project),
    [`traefik.http.routers.${router}.rule`]: `Host(\`${sharedServiceHost(projectId, opened.service)}\`)`,
    [`traefik.http.routers.${router}.entrypoints`]: 'web',
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(opened.port),
  };
}

/**
 * The shared project's file with the opened services labelled for the proxy, on the project's own
 * proxy network (`union-p1-shared-proxy`) besides their default one.
 */
export function withSharedRoutes(
  stack: ComposeJson,
  projectId: number,
  opened: readonly SharedOpened[],
): ComposeJson {
  const services = isRecord(stack.services) ? stack.services : {};
  const open = opened.filter(({ service }) => service in services);
  if (open.length === 0) {
    return stack;
  }
  return {
    ...stack,
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => {
        const entry = open.find((item) => item.service === name);
        const settings = isRecord(service) ? service : {};
        const labels = isRecord(settings.labels) ? settings.labels : {};
        return [
          name,
          entry === undefined
            ? settings
            : {
                ...settings,
                labels: { ...labels, ...routing(projectId, entry) },
                networks: { default: null, [PREVIEW_NETWORK_KEY]: null },
              },
        ];
      }),
    ),
    networks: { [PREVIEW_NETWORK_KEY]: { name: previewProxyNetwork(sharedProject(projectId)) } },
  };
}
