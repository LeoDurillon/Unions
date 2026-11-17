// The Traefik labels of an exposed preview service: its host, and its paths on other services' hosts.
// A path is removed first when asked. All on the preview's own proxy network.
import { previewProxyNetwork } from './preview-proxy-network';

/** A path the service also answers under, on another service's `host` (a full host name). */
type ExposedPath = { host: string; path: string; strip: boolean };

/** A service the proxy serves, at `host` (`t12.union.localhost`, `api-t12.union.localhost`). */
export type ExposedService = { service: string; port: number; host: string; paths?: ExposedPath[] };

/**
 * Above every host router, whose priority is its rule's length (Traefik's default); the longer path
 * higher still, so `/api/v2` wins over `/api` on the same host.
 */
const PATH_PRIORITY = 10_000;

/** `/api` itself and what is below it, not `/apis`. */
function pathRule({ host, path }: ExposedPath): string {
  return `Host(\`${host}\`) && (Path(\`${path}\`) || PathPrefix(\`${path}/\`))`;
}

function pathRouting(router: string, index: number, path: ExposedPath): Record<string, string> {
  const name = `${router}-path${index + 1}`;
  const strip = `${name}-strip`;
  return {
    [`traefik.http.routers.${name}.rule`]: pathRule(path),
    [`traefik.http.routers.${name}.entrypoints`]: 'web',
    [`traefik.http.routers.${name}.priority`]: String(PATH_PRIORITY + path.path.length),
    [`traefik.http.routers.${name}.service`]: router,
    // The middleware also sets `X-Forwarded-Prefix`, for an app that builds its links from it.
    ...(path.strip
      ? {
          [`traefik.http.routers.${name}.middlewares`]: strip,
          [`traefik.http.middlewares.${strip}.stripprefix.prefixes`]: path.path,
        }
      : {}),
  };
}

/**
 * The labels that have the proxy serve one exposed service of compose project `project`. Router
 * names start with `<project>-`, which the idle stop reads in the proxy's request counts.
 */
export function previewRouting(project: string, exposed: ExposedService): Record<string, string> {
  const router = `${project}-${exposed.service}`;
  return {
    'traefik.enable': 'true',
    'traefik.docker.network': previewProxyNetwork(project),
    [`traefik.http.routers.${router}.rule`]: `Host(\`${exposed.host}\`)`,
    [`traefik.http.routers.${router}.entrypoints`]: 'web',
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(exposed.port),
    ...Object.fromEntries(
      (exposed.paths ?? []).flatMap((path, index) =>
        Object.entries(pathRouting(router, index, path)),
      ),
    ),
  };
}
