import path from 'node:path';

/** Where the ticket's repository is in its workspace volume, as the compose helper mounts it. */
export const PREVIEW_REPO_DIR = '/workspace/repo';
/** The keys Union adds to a compose file; the repository's own file may not use them. */
export const PREVIEW_NETWORK_KEY = 'union_preview';
export const PREVIEW_WORKSPACE_KEY = 'union_workspace';
/** The Docker network Traefik routes previews on (created by Union's compose stack). */
export const PREVIEW_NETWORK = 'union-preview';

/** A file Union wrote (or the user edited from it) may use Union's keys, pointing at these. */
export type UnionKeys = { workspaceVolume: string };

const HOST_NAMESPACES = ['pid', 'ipc', 'uts', 'userns_mode', 'cgroup'] as const;
/** Settings that give a container power over the host, refused whatever their value. */
const POWERS = [
  'cap_add',
  'devices',
  'device_cgroup_rules',
  'security_opt',
  'volumes_from',
  'runtime',
  'cgroup_parent',
  'gpus',
] as const;
const MOUNT_TYPES = new Set(['bind', 'volume', 'tmpfs']);

export type ComposeJson = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entries(value: unknown): [string, Record<string, unknown>][] {
  return isRecord(value)
    ? Object.entries(value).flatMap(([key, item]) => [[key, isRecord(item) ? item : {}]] as const)
    : [];
}

function present(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== false && value !== '';
}

/** A path inside the repository: the only host files a preview may use. */
export function insideRepo(source: string): boolean {
  const normalized = path.posix.normalize(source);
  return normalized === PREVIEW_REPO_DIR || normalized.startsWith(`${PREVIEW_REPO_DIR}/`);
}

function serviceSettings(name: string, service: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (service.privileged === true) {
    problems.push(`${name}: privileged containers are not allowed`);
  }
  const mode = service.network_mode;
  if (
    typeof mode === 'string' &&
    mode !== 'bridge' &&
    mode !== 'none' &&
    !mode.startsWith('service:')
  ) {
    problems.push(`${name}: network_mode "${mode}" is not allowed`);
  }
  for (const key of HOST_NAMESPACES) {
    const value = service[key];
    if (typeof value === 'string' && (value === 'host' || value.startsWith('container:'))) {
      problems.push(`${name}: ${key} "${value}" is not allowed`);
    }
  }
  problems.push(
    ...POWERS.filter((key) => present(service[key])).map((key) => `${name}: ${key} is not allowed`),
  );
  return problems;
}

function mountProblems(name: string, mount: unknown, volumes: Set<string>): string[] {
  if (!isRecord(mount)) {
    return [`${name}: a mount the preview cannot read`];
  }
  const type = String(mount.type);
  const source = typeof mount.source === 'string' ? mount.source : '';
  if (!MOUNT_TYPES.has(type)) {
    return [`${name}: ${type} mounts are not allowed`];
  }
  if (type === 'bind' && !insideRepo(source)) {
    return [`${name}: mounts ${source}, outside the repository`];
  }
  if (type === 'volume' && source !== '' && !volumes.has(source)) {
    return [`${name}: volume "${source}" is not declared in the file`];
  }
  return [];
}

/** `env_file` is read by the compose CLI at start: only files of the repository. */
function envFileProblems(name: string, envFile: unknown): string[] {
  const files = Array.isArray(envFile) ? envFile : [envFile];
  return files.flatMap((file: unknown) => {
    const filePath = isRecord(file) ? file.path : file;
    if (filePath === undefined || filePath === null) {
      return [];
    }
    return typeof filePath === 'string' && insideRepo(filePath)
      ? []
      : [`${name}: reads an env file outside the repository`];
  });
}

function contextProblems(name: string, build: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const context = typeof build.context === 'string' ? build.context : PREVIEW_REPO_DIR;
  if (!insideRepo(context)) {
    problems.push(`${name}: builds from ${context}, outside the repository`);
  }
  const { dockerfile } = build;
  if (
    typeof dockerfile === 'string' &&
    path.posix.isAbsolute(dockerfile) &&
    !insideRepo(dockerfile)
  ) {
    problems.push(`${name}: its Dockerfile is outside the repository`);
  }
  const extras = isRecord(build.additional_contexts) ? build.additional_contexts : {};
  for (const [key, extra] of Object.entries(extras)) {
    if (typeof extra !== 'string' || !insideRepo(extra)) {
      problems.push(`${name}: build context "${key}" is outside the repository`);
    }
  }
  return problems;
}

function buildProblems(name: string, build: unknown): string[] {
  if (!isRecord(build)) {
    return [];
  }
  const hostAccess =
    build.network === 'host' || present(build.entitlements) || build.privileged === true;
  return [
    ...contextProblems(name, build),
    ...(hostAccess ? [`${name}: builds with host access are not allowed`] : []),
  ];
}

function unionVolume(key: string, volume: Record<string, unknown>, union?: UnionKeys): boolean {
  return (
    union !== undefined &&
    key === PREVIEW_WORKSPACE_KEY &&
    volume.external === true &&
    volume.name === union.workspaceVolume
  );
}

function volumeProblems(config: ComposeJson, union?: UnionKeys): string[] {
  return entries(config.volumes).flatMap(([key, volume]) => {
    if (unionVolume(key, volume, union)) {
      return [];
    }
    if (volume.external === true) {
      return [`volume "${key}" is external: previews would share it`];
    }
    const custom =
      present(volume.driver_opts) || (present(volume.driver) && volume.driver !== 'local');
    return custom ? [`volume "${key}": custom drivers and options are not allowed`] : [];
  });
}

function networkProblems(config: ComposeJson, union?: UnionKeys): string[] {
  return entries(config.networks)
    .filter(
      ([key, network]) =>
        !(union && key === PREVIEW_NETWORK_KEY && network.name === PREVIEW_NETWORK),
    )
    .filter(([, network]) => network.external === true || network.driver === 'host')
    .map(([key]) => `network "${key}" is external: previews would share it`);
}

function fileProblems(config: ComposeJson): string[] {
  return (['configs', 'secrets'] as const).flatMap((kind) =>
    entries(config[kind])
      .filter(([, item]) => present(item.file))
      .map(([key]) => `${kind} "${key}" reads a file: not supported yet`),
  );
}

function reservedProblems(config: ComposeJson): string[] {
  const used = new Set([
    ...Object.keys(isRecord(config.volumes) ? config.volumes : {}),
    ...Object.keys(isRecord(config.networks) ? config.networks : {}),
  ]);
  return [PREVIEW_NETWORK_KEY, PREVIEW_WORKSPACE_KEY]
    .filter((key) => used.has(key))
    .map((key) => `"${key}" is a name Union uses`);
}

/** Top-level volumes, networks, configs and secrets: nothing shared with other previews or read from the host. */
function topLevelProblems(config: ComposeJson, union?: UnionKeys): string[] {
  return [
    ...volumeProblems(config, union),
    ...networkProblems(config, union),
    ...fileProblems(config),
    // Checked above when the file is Union's: they must point at this ticket's volume and network.
    ...(union ? [] : reservedProblems(config)),
  ];
}

/**
 * Why a resolved compose file (`docker compose config --format json`) cannot run as a preview; empty
 * when it can. The file comes from the ticket's workspace, which the agent can edit: anything that
 * would give a container power over the host, share data with another preview, or read files outside
 * the repository (the workspace also holds the ticket's private attachments) is refused. `union`: the
 * file is Union's own or the user's edit of it, whose workspace volume and preview network are allowed.
 */
export function composeProblems(config: unknown, union?: UnionKeys): string[] {
  if (!isRecord(config) || entries(config.services).length === 0) {
    return ['The compose file has no services'];
  }
  const volumes = new Set(entries(config.volumes).map(([key]) => key));
  const problems = topLevelProblems(config, union);
  for (const [name, service] of entries(config.services)) {
    problems.push(
      ...serviceSettings(name, service),
      ...buildProblems(name, service.build),
      ...envFileProblems(name, service.env_file),
    );
    const mounts = Array.isArray(service.volumes) ? service.volumes : [];
    problems.push(...mounts.flatMap((mount: unknown) => mountProblems(name, mount, volumes)));
  }
  return problems;
}
