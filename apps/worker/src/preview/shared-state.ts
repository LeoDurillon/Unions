// What the worker records of a project's shared services from Docker's state, with a look every 30
// seconds. It records which run, which previews are on their networks, which tickets' agents use
// them.
import {
  saveSharedStack,
  schema,
  SHARED_CONTAINER,
  sharedNetwork,
  sharedProject,
  sharedUrls,
  type SharedOpened,
  type ContainerRuntime,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { PreviewSettings } from './compose';

/** The shared services whose web page the project's settings open, with its port. */
export function sharedOpened(db: Db, projectId: number): SharedOpened[] {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  const preview = project?.config.preview;
  const shared = preview?.sharedServices ?? [];
  return (preview?.sharedCommands ?? []).flatMap(({ service, port }) =>
    port !== undefined && shared.includes(service) ? [{ service, port }] : [],
  );
}

/** What the shared stack needs of a preview's dependencies (`PreviewDeps` has them). */
export type SharedDeps = { db: Db; runtime: ContainerRuntime; settings: PreviewSettings };

const LOOK_EVERY_MS = 30_000;
/** A preview's network: `union-t33_default` is ticket 33's, `union-r5_default` pull request 5's. */
const PREVIEW_NETWORK_OWNER = /^union-(?<key>[tr]\d+)_/u;
/** A ticket's own container on the shared network: its agent uses the services. */
const TICKET_CONTAINER = /^union-t(?<id>\d+)$/u;

async function previewsOf(runtime: ContainerRuntime, containers: string[]): Promise<string[]> {
  const keys = new Set<string>();
  for (const container of containers) {
    for (const network of await runtime.containerNetworks(container)) {
      const key = PREVIEW_NETWORK_OWNER.exec(network)?.groups?.key;
      if (key !== undefined) {
        keys.add(key);
      }
    }
  }
  return [...keys].toSorted();
}

/**
 * Records the project's shared services as Docker has them; `error` when a start failed. Best
 * effort: Docker not answering leaves the last record.
 */
export async function recordShared(
  deps: SharedDeps,
  projectId: number,
  error: string | null = null,
): Promise<void> {
  try {
    const listed = await deps.runtime.projectContainers(sharedProject(projectId));
    const services = [...new Set(listed.map(({ service }) => service))].map((service) => ({
      service,
      running: listed.some((container) => container.service === service && container.running),
    }));
    const onNetwork = await deps.runtime.networkContainers(sharedNetwork(projectId));
    const shared = onNetwork.filter((name) => SHARED_CONTAINER.test(name));
    const agents = onNetwork.flatMap((name) => {
      const id = TICKET_CONTAINER.exec(name)?.groups?.id;
      return id === undefined ? [] : [Number(id)];
    });
    const previews = await previewsOf(deps.runtime, shared);
    const running = services.filter((item) => item.running).map(({ service }) => service);
    const opened = sharedOpened(deps.db, projectId);
    const urls = sharedUrls(projectId, opened, running, deps.settings.publicPort);
    saveSharedStack(deps.db, projectId, { services, previews, agents, urls, error });
  } catch {
    // Docker did not answer: the next look records them.
  }
}

/** Every 30 seconds, records the shared services of the projects that share some: one that crashed shows as stopped. */
export class SharedWatcher {
  private lastLook = 0;
  private looking = false;

  constructor(
    private readonly deps: SharedDeps,
    private readonly now: () => number = Date.now,
  ) {}

  tick(): void {
    const now = this.now();
    if (this.looking || now - this.lastLook < LOOK_EVERY_MS) {
      return;
    }
    this.lastLook = now;
    void this.lookOnce();
  }

  /**
   * The projects to look at: those that share services (their stack may run from before the worker
   * started, unrecorded), and those recorded as running (a project that stopped sharing).
   */
  private watched(): number[] {
    const { db } = this.deps;
    const sharing = db
      .select({ id: schema.projects.id, config: schema.projects.config })
      .from(schema.projects)
      .all()
      .filter(({ config }) => (config.preview?.sharedServices ?? []).length > 0)
      .map(({ id }) => id);
    const running = db
      .select({ projectId: schema.sharedStacks.projectId })
      .from(schema.sharedStacks)
      .where(eq(schema.sharedStacks.status, 'running'))
      .all()
      .map(({ projectId }) => projectId);
    return [...new Set([...sharing, ...running])];
  }

  private async lookOnce(): Promise<void> {
    this.looking = true;
    try {
      for (const projectId of this.watched()) {
        await recordShared(this.deps, projectId);
      }
    } finally {
      this.looking = false;
    }
  }
}
