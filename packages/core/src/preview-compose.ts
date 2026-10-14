import path from 'node:path';

import {
  isRecord,
  PREVIEW_NETWORK,
  PREVIEW_NETWORK_KEY,
  PREVIEW_REPO_DIR,
  PREVIEW_WORKSPACE_KEY,
  type ComposeJson,
} from './preview-compose-check';

export { PREVIEW_NETWORK } from './preview-compose-check';

/** What a ticket's preview is: its compose project, its workspace, and the service the proxy serves. */
export type PreviewTarget = {
  /** Compose project name: `union-t<id>`. */
  project: string;
  workspaceVolume: string;
  /** Host the proxy routes to the exposed service: `<id>.localhost`. */
  host: string;
  service: string;
  port: number;
  /** The project's variables, given to every service. */
  env: Record<string, string>;
};

/** The services a resolved compose file defines, in its order. */
export function composeServices(config: unknown): string[] {
  return isRecord(config) && isRecord(config.services) ? Object.keys(config.services) : [];
}

/** A bind mount of the repository becomes a mount of the same folder of the workspace volume. */
function workspaceMount(mount: unknown): unknown {
  if (!isRecord(mount) || mount.type !== 'bind' || typeof mount.source !== 'string') {
    return mount;
  }
  const relative = path.posix.relative(PREVIEW_REPO_DIR, path.posix.normalize(mount.source));
  const subpath = relative === '' ? 'repo' : `repo/${relative}`;
  return {
    type: 'volume',
    source: PREVIEW_WORKSPACE_KEY,
    target: mount.target,
    ...(mount.read_only === true ? { read_only: true } : {}),
    volume: { subpath },
  };
}

function withoutTraefik(labels: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(isRecord(labels) ? labels : {}).filter(([key]) => !key.startsWith('traefik.')),
  );
}

function routing(target: PreviewTarget): Record<string, string> {
  const router = target.project;
  return {
    'traefik.enable': 'true',
    'traefik.docker.network': PREVIEW_NETWORK,
    [`traefik.http.routers.${router}.rule`]: `Host(\`${target.host}\`)`,
    [`traefik.http.routers.${router}.entrypoints`]: 'web',
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(target.port),
  };
}

function rewriteService(
  name: string,
  service: Record<string, unknown>,
  target: PreviewTarget,
): Record<string, unknown> {
  const { container_name: _name, ports: _ports, ...rest } = service;
  const exposed = name === target.service;
  const environment = {
    ...(isRecord(service.environment) ? service.environment : {}),
    ...target.env,
  };
  const networks = isRecord(service.networks) ? service.networks : { default: null };
  return {
    ...rest,
    environment,
    labels: { ...withoutTraefik(service.labels), ...(exposed ? routing(target) : {}) },
    ...(exposed ? { networks: { ...networks, [PREVIEW_NETWORK_KEY]: null } } : {}),
  };
}

/**
 * The repository's bind mounts as mounts of the ticket's workspace volume, declared external: Docker
 * resolves bind mounts on the host, where the workspace is not. The user's own file gets this too.
 */
export function withWorkspaceMounts(config: ComposeJson, workspaceVolume: string): ComposeJson {
  const services = isRecord(config.services) ? config.services : {};
  return {
    ...config,
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => {
        const settings = isRecord(service) ? service : {};
        return [
          name,
          Array.isArray(settings.volumes)
            ? {
                ...settings,
                volumes: settings.volumes.map((mount: unknown) => workspaceMount(mount)),
              }
            : settings,
        ];
      }),
    ),
    volumes: {
      ...(isRecord(config.volumes) ? config.volumes : {}),
      [PREVIEW_WORKSPACE_KEY]: { external: true, name: workspaceVolume },
    },
  };
}

/**
 * The file the preview runs, written from the resolved one (after `composeProblems` found nothing):
 * the ticket's own compose project, no fixed container names or host ports (the proxy routes the
 * traffic), the repository's mounts taken from the workspace volume, the project's variables in every
 * service, and the exposed service labelled for Traefik on the preview network.
 */
export function previewCompose(config: ComposeJson, target: PreviewTarget): ComposeJson {
  const services = isRecord(config.services) ? config.services : {};
  const rewritten: ComposeJson = {
    ...config,
    name: target.project,
    services: Object.fromEntries(
      Object.entries(services).map(([name, service]) => [
        name,
        rewriteService(name, isRecord(service) ? service : {}, target),
      ]),
    ),
    networks: {
      ...(isRecord(config.networks) ? config.networks : {}),
      [PREVIEW_NETWORK_KEY]: { external: true, name: PREVIEW_NETWORK },
    },
  };
  return withWorkspaceMounts(rewritten, target.workspaceVolume);
}

/** Service settings Docker prints when unset (`command: null`, `labels: {}`): noise in a file people read. */
const UNSET_WHEN_EMPTY = new Set(['command', 'entrypoint', 'environment', 'labels']);

function isEmpty(value: unknown): boolean {
  return value === null || (isRecord(value) && Object.keys(value).length === 0);
}

function tidyService(service: unknown): unknown {
  return isRecord(service)
    ? Object.fromEntries(
        Object.entries(service).filter(
          ([key, value]) => !(UNSET_WHEN_EMPTY.has(key) && isEmpty(value)),
        ),
      )
    : service;
}

function tidyNetwork(network: unknown): unknown {
  if (!isRecord(network)) {
    return network;
  }
  const { ipam, ...rest } = network;
  return isEmpty(ipam) ? rest : network;
}

function mapValues(value: unknown, tidy: (item: unknown) => unknown): unknown {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tidy(item)]))
    : value;
}

/** The same file without the settings Docker prints as unset, so the one people read is short. */
export function tidyCompose(config: ComposeJson): ComposeJson {
  return {
    ...config,
    services: mapValues(config.services, tidyService),
    ...(config.networks === undefined ? {} : { networks: mapValues(config.networks, tidyNetwork) }),
  };
}

/** Why the exposed service cannot be served; null when it can. */
export function exposedServiceProblem(config: unknown, service: string): string | null {
  const services = composeServices(config);
  if (!services.includes(service)) {
    return `The compose file has no service "${service}" (it has: ${services.join(', ') || 'none'})`;
  }
  const settings =
    isRecord(config) && isRecord(config.services) ? config.services[service] : undefined;
  return isRecord(settings) && typeof settings.network_mode === 'string'
    ? `"${service}" shares another container's network: the proxy cannot reach it`
    : null;
}
