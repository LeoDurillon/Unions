import path from 'node:path';

import { PUBLISHED_PORTS_KEY } from './agent-environment';
import {
  isRecord,
  PREVIEW_ENV_FILE,
  PREVIEW_ENV_KEY,
  PREVIEW_NETWORK,
  PREVIEW_NETWORK_KEY,
  PREVIEW_REPO_DIR,
  PREVIEW_WORKSPACE_KEY,
  type ComposeJson,
} from './preview-compose-check';

export { PREVIEW_ENV_FILE, PREVIEW_ENV_KEY, PREVIEW_NETWORK } from './preview-compose-check';

/** A service the proxy serves, at `host` (`12.localhost`, `api.12.localhost`). */
export type ExposedService = { service: string; port: number; host: string };

/**
 * What a ticket's preview is: its compose project, its workspace, the services the proxy serves,
 * and the names of the project's variables, which every service reads from Union's env file.
 */
export type PreviewTarget = {
  /** Compose project name: `union-t<id>`. */
  project: string;
  workspaceVolume: string;
  exposed: ExposedService[];
  /** The project's variables: given by `PREVIEW_ENV_FILE`, so the file does not repeat them. */
  variables: string[];
  /** The variables as a file inside one service (`content` already written). */
  envFile?: { service: string; path: string; content: string };
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

function routing(project: string, exposed: ExposedService): Record<string, string> {
  const router = `${project}-${exposed.service}`;
  return {
    'traefik.enable': 'true',
    'traefik.docker.network': PREVIEW_NETWORK,
    [`traefik.http.routers.${router}.rule`]: `Host(\`${exposed.host}\`)`,
    [`traefik.http.routers.${router}.entrypoints`]: 'web',
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(exposed.port),
  };
}

function withEnvFile(service: Record<string, unknown>, target: string): unknown[] {
  const configs: unknown[] = Array.isArray(service.configs) ? service.configs : [];
  return [...configs, { source: PREVIEW_ENV_KEY, target }];
}

function rewriteService(
  name: string,
  service: Record<string, unknown>,
  target: PreviewTarget,
): Record<string, unknown> {
  // `profiles` too: the profiles were applied when the file was resolved, the file runs whole.
  const { container_name: _name, ports, profiles: _profiles, ...rest } = service;
  const exposed = target.exposed.find((candidate) => candidate.service === name);
  // A service's own `environment` wins over its env file: the project's variables leave it.
  const environment = Object.fromEntries(
    Object.entries(isRecord(service.environment) ? service.environment : {}).filter(
      ([key]) => !target.variables.includes(key),
    ),
  );
  const networks = isRecord(service.networks) ? service.networks : { default: null };
  return {
    ...rest,
    // Not published: the agent reaches them on its `localhost` (`agentForwards`).
    ...(Array.isArray(ports) && ports.length > 0 ? { [PUBLISHED_PORTS_KEY]: ports } : {}),
    environment,
    ...(target.variables.length > 0 ? { env_file: [PREVIEW_ENV_FILE] } : {}),
    labels: {
      ...withoutTraefik(service.labels),
      ...(exposed ? routing(target.project, exposed) : {}),
    },
    ...(exposed ? { networks: { ...networks, [PREVIEW_NETWORK_KEY]: null } } : {}),
    ...(target.envFile?.service === name
      ? { configs: withEnvFile(service, target.envFile.path) }
      : {}),
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
 * service (and as a file in one, if asked), and the exposed services labelled for Traefik on the
 * preview network.
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
    ...(target.envFile
      ? {
          configs: {
            ...(isRecord(config.configs) ? config.configs : {}),
            [PREVIEW_ENV_KEY]: { content: target.envFile.content },
          },
        }
      : {}),
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

function insideFolder(file: string, folder: string): boolean {
  const normalized = path.posix.normalize(file);
  return normalized === folder || normalized.startsWith(`${folder.replace(/\/$/u, '')}/`);
}

/**
 * Why the variables cannot be given as a file at `path` in `service` of the file to run; null when
 * they can. Docker copies the file into the container, so inside a folder mounted from the workspace
 * it would land in the agent's working copy, secrets included, where it could be read or committed.
 */
export function envFileProblem(
  file: ComposeJson,
  envFile: { service: string; path: string },
): string | null {
  const services = isRecord(file.services) ? file.services : {};
  const service = services[envFile.service];
  if (!isRecord(service)) {
    return `The env file's service "${envFile.service}" is not in the compose file`;
  }
  if (!path.posix.isAbsolute(envFile.path)) {
    return `The env file's path must be absolute inside the service (got "${envFile.path}")`;
  }
  const mounts: unknown[] = Array.isArray(service.volumes) ? service.volumes : [];
  const workspace = mounts.find(
    (mount: unknown) =>
      isRecord(mount) &&
      mount.source === PREVIEW_WORKSPACE_KEY &&
      typeof mount.target === 'string' &&
      insideFolder(envFile.path, mount.target),
  );
  return isRecord(workspace)
    ? `The env file ${envFile.path} would be written into the workspace (mounted at ${String(workspace.target)}), where the agent could read or commit it: give a path outside it, or read the variables from the environment`
    : null;
}

/**
 * The same file without its services' `profiles`: the selection was applied when it was resolved,
 * and `up` would leave out again any service that still names one.
 */
export function withoutProfiles(config: ComposeJson): ComposeJson {
  return {
    ...config,
    services: mapValues(config.services, (service) => {
      if (!isRecord(service)) {
        return service;
      }
      const { profiles: _profiles, ...rest } = service;
      return rest;
    }),
  };
}

/**
 * The folders of the workspace a file mounts (`repo/dev/.npm`), for the worker to create when
 * missing: compose creates a missing bind-mount source, but Docker refuses a volume sub-path that
 * does not exist, and the repository's bind mounts became sub-path mounts.
 */
export function workspaceSubpaths(config: ComposeJson): string[] {
  const services = isRecord(config.services) ? Object.values(config.services) : [];
  const subpaths = services.flatMap((service) => {
    const mounts: unknown[] =
      isRecord(service) && Array.isArray(service.volumes) ? service.volumes : [];
    return mounts.flatMap((mount) => {
      const options = isRecord(mount) && isRecord(mount.volume) ? mount.volume : {};
      return isRecord(mount) &&
        mount.source === PREVIEW_WORKSPACE_KEY &&
        typeof options.subpath === 'string'
        ? [options.subpath]
        : [];
    });
  });
  return [...new Set(subpaths)];
}
