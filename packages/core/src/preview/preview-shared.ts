// Services shared between a project's previews, written as the shared compose project Union runs
// once. They are taken out of a preview's resolved file into its `x-union-shared` extension and
// checked.

import { PUBLISHED_PORTS_KEY } from '../agent/agent-environment';
import {
  isRecord,
  PREVIEW_ENV_FILE,
  PREVIEW_WORKSPACE_KEY,
  type ComposeJson,
} from './preview-compose-check';

/** Where a preview's file keeps the shared services' definitions: compose ignores `x-` keys. */
export const SHARED_KEY = 'x-union-shared';

/** The project's shared compose project: `union-p3-shared`. */
export function sharedProject(projectId: number): string {
  return `union-p${projectId}-shared`;
}

/** The shared project's own network, where only its containers and tickets' containers are. */
export function sharedNetwork(projectId: number): string {
  return `${sharedProject(projectId)}_default`;
}

/** A shared container: `union-p3-shared-clamav-1`. */
export const SHARED_CONTAINER = /^union-p\d+-shared-/u;

const SERVICE_MODE = 'service:';

type Services = Record<string, Record<string, unknown>>;

function servicesOf(file: ComposeJson): Services {
  const services = isRecord(file.services) ? file.services : {};
  return Object.fromEntries(
    Object.entries(services).map(([name, service]) => [name, isRecord(service) ? service : {}]),
  );
}

function dependencies(service: Record<string, unknown>): string[] {
  return isRecord(service.depends_on) ? Object.keys(service.depends_on) : [];
}

function mountProblems(name: string, service: Record<string, unknown>): string[] {
  const mounts: unknown[] = Array.isArray(service.volumes) ? service.volumes : [];
  return mounts.flatMap((mount) =>
    isRecord(mount) && (mount.type === 'bind' || mount.source === PREVIEW_WORKSPACE_KEY)
      ? [
          `${name}: mounts ${String(mount.source)} from the repository, which a shared service cannot`,
        ]
      : [],
  );
}

/** Why one shared service cannot run outside the preview. */
function sharedProblems(
  name: string,
  service: Record<string, unknown>,
  shared: readonly string[],
  exposed: readonly string[],
): string[] {
  const problems: string[] = [];
  if (exposed.includes(name)) {
    problems.push(`${name}: the proxy serves it, so it cannot be shared`);
  }
  if (service.build !== undefined) {
    problems.push(`${name}: builds its image from the repository; a shared service runs an image`);
  }
  if (service.network_mode !== undefined) {
    problems.push(`${name}: sets network_mode, which a shared service cannot`);
  }
  if (service.configs !== undefined || service.secrets !== undefined) {
    problems.push(`${name}: uses compose configs or secrets, which a shared service cannot`);
  }
  problems.push(
    ...dependencies(service)
      .filter((dependency) => !shared.includes(dependency))
      .map((dependency) => `${name}: depends on "${dependency}", which is not shared`),
    ...mountProblems(name, service),
  );
  return problems;
}

/** Why a service that stays in the preview cannot use the shared ones. */
function stayingProblems(
  name: string,
  service: Record<string, unknown>,
  shared: readonly string[],
): string[] {
  const mode = service.network_mode;
  const target =
    typeof mode === 'string' && mode.startsWith(SERVICE_MODE)
      ? mode.slice(SERVICE_MODE.length)
      : null;
  return target !== null && shared.includes(target)
    ? [`${name}: uses the network of "${target}", which is shared`]
    : [];
}

/** A shared service as the shared project runs it: its own network, no fixed name, ports kept for forwards. */
function sharedService(
  service: Record<string, unknown>,
  variables: readonly string[],
): Record<string, unknown> {
  const {
    container_name: _name,
    profiles: _profiles,
    networks: _networks,
    links: _links,
    ports,
    labels,
    env_file: envFile,
    environment,
    ...rest
  } = service;
  const own = Object.entries(isRecord(environment) ? environment : {}).filter(
    ([key]) => !variables.includes(key),
  );
  // A file Union wrote gives every service the preview's variables: never a shared one.
  const envFiles = (Array.isArray(envFile) ? envFile : []).filter(
    (entry: unknown) => entry !== PREVIEW_ENV_FILE,
  );
  const kept = Object.entries(isRecord(labels) ? labels : {}).filter(
    ([key]) => !key.startsWith('traefik.'),
  );
  return {
    ...rest,
    ...(Array.isArray(ports) && ports.length > 0 ? { [PUBLISHED_PORTS_KEY]: ports } : {}),
    ...(kept.length > 0 ? { labels: Object.fromEntries(kept) } : {}),
    ...(envFiles.length > 0 ? { env_file: envFiles } : {}),
    ...(own.length > 0 ? { environment: Object.fromEntries(own) } : {}),
  };
}

function withoutDependencies(
  service: Record<string, unknown>,
  shared: readonly string[],
): Record<string, unknown> {
  if (!isRecord(service.depends_on)) {
    return service;
  }
  const kept = Object.entries(service.depends_on).filter(([name]) => !shared.includes(name));
  const { depends_on: _dependsOn, links, ...rest } = service;
  const linked = (Array.isArray(links) ? links : []).filter(
    (link: unknown) => typeof link !== 'string' || !shared.includes(link.split(':')[0] ?? ''),
  );
  return {
    ...rest,
    ...(kept.length > 0 ? { depends_on: Object.fromEntries(kept) } : {}),
    ...(linked.length > 0 ? { links: linked } : {}),
  };
}

/** The named volumes the shared services mount, without the preview's names: the shared project names them. */
function sharedVolumes(file: ComposeJson, services: Services): Record<string, unknown> {
  const declared = isRecord(file.volumes) ? file.volumes : {};
  const used = Object.values(services).flatMap((service) =>
    (Array.isArray(service.volumes) ? service.volumes : []).flatMap((mount: unknown) =>
      isRecord(mount) && mount.type === 'volume' && typeof mount.source === 'string'
        ? [mount.source]
        : [],
    ),
  );
  return Object.fromEntries(
    [...new Set(used)].map((name) => {
      const volume = declared[name];
      const { name: _name, ...rest } = isRecord(volume) ? volume : {};
      return [name, rest];
    }),
  );
}

/** The volumes the preview's own services still mount. */
function stayingVolumes(file: ComposeJson, staying: Services): Record<string, unknown> | undefined {
  if (!isRecord(file.volumes)) {
    return undefined;
  }
  const used = new Set(Object.keys(sharedVolumes(file, staying)));
  return Object.fromEntries(Object.entries(file.volumes).filter(([name]) => used.has(name)));
}

export type SharedSplit = { file: ComposeJson; problems: string[] };

/**
 * What the split needs from the preview: the services the proxy serves (never shared), and the
 * names of the project's variables, which a shared service never gets (a resolved file Union wrote
 * holds them in every service's `environment`).
 */
export type SharedContext = { exposed: readonly string[]; variables: readonly string[] };

/**
 * A preview's resolved file with the `shared` services taken out (into `SHARED_KEY`) and the others'
 * `depends_on` on them dropped; `problems` says why it cannot be done. A shared service the file
 * does not define (another branch, a profile left out) is skipped.
 */
export function splitShared(
  resolved: ComposeJson,
  shared: readonly string[],
  context: SharedContext,
): SharedSplit {
  const services = servicesOf(resolved);
  const moving = shared.filter((name) => name in services);
  if (moving.length === 0) {
    return { file: resolved, problems: [] };
  }
  const staying: Services = {};
  const moved: Services = {};
  const problems: string[] = [];
  for (const [name, service] of Object.entries(services)) {
    if (moving.includes(name)) {
      problems.push(...sharedProblems(name, service, moving, context.exposed));
      moved[name] = sharedService(service, context.variables);
    } else {
      problems.push(...stayingProblems(name, service, moving));
      staying[name] = withoutDependencies(service, moving);
    }
  }
  const volumes = stayingVolumes(resolved, staying);
  // A file the user edited from Union's may hold some already.
  const before = sharedPart(resolved);
  const file: ComposeJson = {
    ...resolved,
    services: staying,
    ...(volumes === undefined ? {} : { volumes }),
    [SHARED_KEY]: {
      services: { ...before?.services, ...moved },
      volumes: { ...before?.volumes, ...sharedVolumes(resolved, moved) },
    },
  };
  return { file, problems };
}

/** The shared services a preview's file uses, with their definitions; null when none. */
export function sharedPart(
  file: ComposeJson,
): { services: Services; volumes: Record<string, unknown> } | null {
  const part = file[SHARED_KEY];
  if (!isRecord(part) || !isRecord(part.services) || Object.keys(part.services).length === 0) {
    return null;
  }
  return {
    services: servicesOf(part),
    volumes: isRecord(part.volumes) ? part.volumes : {},
  };
}

/** The file the shared project runs, from a preview's file; null when it shares nothing. */
export function sharedStackFile(file: ComposeJson, projectId: number): ComposeJson | null {
  const part = sharedPart(file);
  return part === null
    ? null
    : {
        name: sharedProject(projectId),
        services: part.services,
        ...(Object.keys(part.volumes).length > 0 ? { volumes: part.volumes } : {}),
      };
}

/**
 * A file whose owner may not share (a fork's pull request), with the shared services back in it: its
 * own copies, on its default network.
 */
export function withSharedInline(file: ComposeJson): ComposeJson {
  const part = sharedPart(file);
  const { [SHARED_KEY]: _shared, ...rest } = file;
  if (part === null) {
    return rest;
  }
  return {
    ...rest,
    services: { ...servicesOf(rest), ...part.services },
    volumes: { ...(isRecord(rest.volumes) ? rest.volumes : {}), ...part.volumes },
  };
}
