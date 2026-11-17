// An exposed service's further addresses, paths on other exposed services' hosts: read and checked.
// Browser-safe: the Compose page shows the problems the server refuses a save for, as they are typed.
import { isRecord } from '../agent/agent-activity';
import type { PreviewPath, PreviewService } from '../schema/schema-types';

export type { PreviewPath } from '../schema/schema-types';

/** Segments of letters, digits and `.`, `_`, `~`, `-`: safe in a proxy rule, no pattern. */
const PATH = /^(?:\/[A-Za-z0-9._~-]+)+$/u;
const MAX_PATH_LENGTH = 200;
const MAX_PATHS = 10;

/** The path as it is kept: trimmed, without a final `/`. */
export function normalizePreviewPath(path: string): string {
  const trimmed = path.trim();
  return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** Why a path cannot be served, or null. */
export function previewPathProblem(path: string): string | null {
  if (path === '' || path === '/') {
    return 'give a path below the root, such as /api';
  }
  if (path.length > MAX_PATH_LENGTH) {
    return `at most ${MAX_PATH_LENGTH} characters`;
  }
  return PATH.test(path)
    ? null
    : `"${path}" must start with / and hold only letters, digits, /, ., _, ~ and -`;
}

/** How a host is named in a message: its service, or the main host. */
function hostName(services: readonly PreviewService[], host: string): string {
  const owner = services.find((service) => service.prefix === host);
  return owner ? `${owner.name}'s host` : `the host "${host}"`;
}

function hostProblem(
  services: readonly PreviewService[],
  service: PreviewService,
  host: string,
): string | null {
  if (host === service.prefix) {
    return `${service.name} answers on its own host at every path already`;
  }
  return services.some((other) => other.prefix === host)
    ? null
    : `${service.name}: no exposed service has the host prefix "${host}"`;
}

/** One message per path of `service` that cannot be served. */
function serviceProblems(services: readonly PreviewService[], service: PreviewService): string[] {
  return (service.paths ?? []).flatMap(({ host, path }) => {
    const problems = [hostProblem(services, service, host)];
    const syntax = previewPathProblem(path);
    problems.push(syntax === null ? null : `${service.name}: ${syntax}`);
    return problems.filter((problem): problem is string => problem !== null);
  });
}

/**
 * What stops the exposed services' paths from being served: a path that is not one, a host no
 * other exposed service has, or one host and path given twice. A path inside another on the same
 * host (`/api`, `/api/v2`) is allowed: the longest wins.
 */
export function previewPathProblems(services: readonly PreviewService[]): string[] {
  const problems = services.flatMap((service) => serviceProblems(services, service));
  const seen = new Set<string>();
  for (const service of services) {
    for (const { host, path } of service.paths ?? []) {
      const key = `${host} ${path}`;
      if (seen.has(key)) {
        problems.push(`${path} on ${hostName(services, host)} is given twice`);
      }
      seen.add(key);
    }
  }
  return problems;
}

function pathOf(item: unknown, service: string): PreviewPath {
  const entry = isRecord(item) ? item : {};
  const host = typeof entry.host === 'string' ? entry.host.trim().toLowerCase() : '';
  const path = normalizePreviewPath(typeof entry.path === 'string' ? entry.path : '');
  const problem = previewPathProblem(path);
  if (problem !== null) {
    throw new Error(`${service}: ${problem}`);
  }
  return { host, path, strip: entry.strip !== false };
}

/**
 * A service's paths as sent, each path checked alone (`previewPathProblems` checks them against
 * the other services); none is an empty list. Throws with the reason.
 */
export function parsePreviewPaths(value: unknown, service: string): PreviewPath[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`${service}: give its further addresses as a list`);
  }
  if (value.length > MAX_PATHS) {
    throw new Error(`${service}: at most ${MAX_PATHS} further addresses`);
  }
  return value.map((item: unknown) => pathOf(item, service));
}

/** A path of an exposed service at the address of the service whose host it is on. */
export type PathAddress = {
  service: string;
  port: number;
  /** The host's address without the path: `http://t12.union.localhost:8080`. */
  url: string;
  path: string;
  strip: boolean;
};

/**
 * Every path of the exposed services at the public address of the host it is on, from the
 * preview's addresses (`urls`): a host whose service has no address is left out.
 */
export function previewPathAddresses(
  urls: readonly { service: string; url: string }[],
  services: readonly PreviewService[],
): PathAddress[] {
  return services.flatMap((service) =>
    (service.paths ?? []).flatMap(({ host, path, strip }) => {
      const owner = services.find((candidate) => candidate.prefix === host);
      const url = urls.find((candidate) => candidate.service === owner?.name)?.url;
      return url === undefined
        ? []
        : [{ service: service.name, port: service.port, url, path, strip }];
    }),
  );
}
