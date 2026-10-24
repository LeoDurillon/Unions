// Routes the preview's public addresses inside its owner's container, to its services on their network.
import {
  exposedServices,
  getPreview,
  ownerKey,
  schema,
  type ContainerRuntime,
  type Db,
  type PreviewConfig,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { mustRunIn } from '../container-exec';
import { ensureHostRouter, type HostRoutes } from './forwarder';

const HTTP_PORT = 80;

/**
 * Replaces the lines Union added to `/etc/hosts` with the preview's hosts. Docker mounts the file,
 * so it is rewritten in place rather than moved. Kept in memory, not in a file: this runs as root,
 * and the agent can write anywhere a temporary file would go. `set -f`: a host is never a pattern.
 */
const WRITE_HOSTS = `set -f
kept=$(grep -v ' # union-preview$' /etc/hosts); [ $? -le 1 ] || exit 1
{ printf '%s\\n' "$kept"; for host in $UNION_HOSTS; do echo "127.0.0.1 $host # union-preview"; done; } > /etc/hosts`;

/**
 * Browsers take `*.localhost` for the container itself, but Node's resolver does not: without
 * these lines, a test's API calls (Playwright's `request`) cannot reach the preview's addresses.
 */
async function resolveHosts(
  runtime: ContainerRuntime,
  container: string,
  routes: HostRoutes,
): Promise<void> {
  await mustRunIn(runtime, container, ['sh', '-c', WRITE_HOSTS], {
    user: 'root',
    env: { UNION_HOSTS: Object.keys(routes.hosts).join(' ') },
  });
}

/** Each public address's host to its service and port; null when the preview exposes nothing. */
export function previewRoutes(
  urls: readonly { service: string; url: string }[],
  config: PreviewConfig,
): HostRoutes | null {
  const services = exposedServices(config);
  const hosts: HostRoutes['hosts'] = {};
  let port: number | null = null;
  for (const { service, url } of urls) {
    const exposed = services.find((candidate) => candidate.name === service);
    if (exposed) {
      const parsed = new URL(url);
      port = parsed.port === '' ? HTTP_PORT : Number(parsed.port);
      hosts[parsed.hostname] = { service, port: exposed.port };
    }
  }
  return port === null ? null : { port, hosts };
}

/**
 * While the owner's preview runs, its container answers at the preview's public addresses, as the
 * user's browser does: a browser test there gets the same hosts and cookies. Best effort: a
 * container that is not running gets it when it joins the preview again.
 */
export async function routeToPreview(
  db: Db,
  runtime: ContainerRuntime,
  owner: WorkspaceOwner,
): Promise<void> {
  const preview = getPreview(db, owner);
  if (preview?.status !== 'running' || !preview.urls) {
    return;
  }
  const config = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, preview.projectId))
    .get()?.config.preview;
  const routes = config ? previewRoutes(preview.urls, config) : null;
  if (!routes) {
    return;
  }
  const container = `union-${ownerKey(owner)}`;
  try {
    await ensureHostRouter(runtime, container, routes);
    await resolveHosts(runtime, container, routes);
  } catch {
    // The container is not running.
  }
}
