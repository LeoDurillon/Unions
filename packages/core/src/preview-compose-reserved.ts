// Names a preview may not take: a build tagged as an image Union runs, and volumes or networks named like Union's.

/**
 * Image repositories Union runs or builds from: its stack (`union-dev`), the compose helper and the
 * proxy (both hold the Docker socket), and the agent images' bases. A preview's build tagged with
 * one of them replaces it locally, and the next container started from it runs the preview's code.
 */
const RESERVED_REPOSITORIES = new Set(['docker', 'traefik', 'oven/bun', 'node', 'debian']);
/** Union names its own images, containers, volumes and networks `union-…`. */
const UNION_PREFIX = 'union-';
const DEFAULT_REGISTRY = /^(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)\//u;
const OFFICIAL_NAMESPACE = /^library\//u;

/** The repository an image reference names, without registry, tag or digest: `docker.io/library/node:22` → `node`. */
export function imageRepository(image: string): string {
  const [named = ''] = image.split('@');
  const tag = named.lastIndexOf(':');
  const untagged = tag > named.lastIndexOf('/') ? named.slice(0, tag) : named;
  return untagged.toLowerCase().replace(DEFAULT_REGISTRY, '').replace(OFFICIAL_NAMESPACE, '');
}

function reservedImage(image: string): boolean {
  const repository = imageRepository(image);
  return repository.startsWith(UNION_PREFIX) || RESERVED_REPOSITORIES.has(repository);
}

/** A built service tagged with an image Union runs. Running such an image unbuilt changes nothing local. */
export function buildTagProblems(name: string, service: Record<string, unknown>): string[] {
  const { build, image } = service;
  const built = build !== undefined && build !== null;
  return built && typeof image === 'string' && reservedImage(image)
    ? [`${name}: builds into "${image}", an image Union runs`]
    : [];
}

export type NamedItem = [key: string, item: Record<string, unknown>];

/**
 * Volumes or networks named like Union's (`union-…`): another ticket's workspace, another preview's
 * data, the proxy's network. Allowed only under the name compose gives the project's own
 * (`<project>_<key>`), or the one `allowed` gives the key (Union's keys, in a file Union wrote).
 */
export function foreignNameProblems(
  kind: 'volume' | 'network',
  items: NamedItem[],
  project: unknown,
  allowed: Record<string, string> = {},
): string[] {
  return items.flatMap(([key, item]) => {
    const { name } = item;
    if (typeof name !== 'string' || !name.toLowerCase().startsWith(UNION_PREFIX)) {
      return [];
    }
    const own = typeof project === 'string' && name === `${project}_${key}`;
    return own || allowed[key] === name
      ? []
      : [`${kind} "${key}" is named "${name}", a name Union uses`];
  });
}
