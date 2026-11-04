// Notices a running preview whose exposed services stopped (crashed, killed) and fails it, with why.
import {
  activePreviews,
  emitEvent,
  getPreview,
  getTicket,
  previewOwner,
  previewProject,
  stoppedServices,
  ticketOwnerId,
  updatePreview,
  type ContainerRuntime,
  type Db,
  type WorkspaceOwner,
} from '@union/core';

import { bringDown, serviceLogs, type PreviewDeps } from './run';

const CHECK_EVERY_MS = 30_000;

type Stopped = ReturnType<typeof stoppedServices>;

/** The exposed services' names; a preview from before several services were possible has none. */
function exposedServices(urls: { service: string }[] | null): string[] {
  return (urls ?? []).map(({ service }) => service).filter((service) => service !== '');
}

async function stoppedOf(
  runtime: ContainerRuntime,
  owner: WorkspaceOwner,
  urls: { service: string }[] | null,
): Promise<Stopped> {
  const services = exposedServices(urls);
  if (services.length === 0) {
    return [];
  }
  return stoppedServices(services, await runtime.projectContainers(previewProject(owner)));
}

function stoppedMessage(stopped: Stopped): string {
  const each = stopped.map(({ service, exitCode }) =>
    exitCode === null ? `"${service}" is gone` : `"${service}" exited (code ${exitCode})`,
  );
  return `The preview stopped: ${each.join(', ')}`;
}

export type HealthDeps = {
  db: Db;
  runtime: ContainerRuntime;
  /** Fails the preview, through the manager: never during a start, a stop or its tests. */
  onStopped: (owner: WorkspaceOwner) => void;
  now?: () => number;
};

/** Every 30 seconds, asks Docker whether each running preview's exposed services are still up. */
export class HealthWatcher {
  private lastCheck = 0;
  private checking = false;

  constructor(private readonly deps: HealthDeps) {}

  tick(): void {
    const now = (this.deps.now ?? Date.now)();
    if (this.checking || now - this.lastCheck < CHECK_EVERY_MS) {
      return;
    }
    this.lastCheck = now;
    void this.checkOnce();
  }

  private async checkOnce(): Promise<void> {
    this.checking = true;
    try {
      await this.check();
    } finally {
      this.checking = false;
    }
  }

  async check(): Promise<void> {
    const running = activePreviews(this.deps.db).filter((row) => row.status === 'running');
    for (const row of running) {
      const owner = previewOwner(row);
      try {
        const stopped = await stoppedOf(this.deps.runtime, owner, row.urls);
        if (stopped.length > 0) {
          this.deps.onStopped(owner);
        }
      } catch {
        // Docker did not answer: the next check asks again.
      }
    }
  }
}

/**
 * Fails a running preview whose exposed services stopped, with their last output. Its containers
 * and networks are removed, its volumes kept, so a start brings it back with its data; while a step
 * runs on the ticket they are left to the agent, which uses its services.
 */
export async function failStoppedPreview(deps: PreviewDeps, owner: WorkspaceOwner): Promise<void> {
  const row = getPreview(deps.db, owner);
  if (row?.status !== 'running') {
    return;
  }
  const stopped = await stoppedOf(deps.runtime, owner, row.urls);
  if (stopped.length === 0) {
    return;
  }
  const logTail = await serviceLogs(deps, owner);
  const ticketId = ticketOwnerId(owner);
  if (ticketId === null || getTicket(deps.db, ticketId).phase.kind !== 'running') {
    await bringDown(deps, owner);
  }
  const message = stoppedMessage(stopped);
  updatePreview(deps.db, owner, {
    status: 'failed',
    error: `${message}. Start it again; its data is kept.`,
    logTail: logTail === '' ? null : logTail,
    logAt: Date.now(),
  });
  if (ticketId !== null) {
    emitEvent(deps.db, {
      type: 'preview_services_stopped',
      ticketId,
      payload: { services: stopped.map(({ service }) => service), message },
    });
  }
}
