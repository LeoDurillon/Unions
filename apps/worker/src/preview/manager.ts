import {
  emitEvent,
  ownerKey,
  recordE2e,
  recoverPreviews,
  ticketOwnerId,
  type WorkspaceOwner,
} from '@union/core';

import type { PreviewAction } from '../commands';
import { runRequestedE2e } from '../e2e-request';
import { previewSettings } from './compose';
import { generatePreviewFile } from './compose-file';
import { IdleWatcher, readProxyMetrics } from './idle';
import { startReviewPreview, updateReviewPreview } from './review-preview';
import { refreshPreviewLogs, startPreview, stopPreview, takeDown, type PreviewDeps } from './run';

type Action = (deps: PreviewDeps, owner: WorkspaceOwner) => Promise<unknown>;

/** A pull request's start checks it out first; only a pull request's checkout can be updated. */
const ACTIONS: Record<Exclude<PreviewAction, 'e2e'>, Action> = {
  start: (deps, owner) =>
    'reviewId' in owner ? startReviewPreview(deps, owner.reviewId) : startPreview(deps, owner),
  stop: stopPreview,
  logs: refreshPreviewLogs,
  generate: generatePreviewFile,
  update: (deps, owner) =>
    'reviewId' in owner ? updateReviewPreview(deps, owner.reviewId) : Promise.resolve(),
};

/** Container names of previews' owners: a ticket's own is `union-t<id>`, a pull request's `union-r<id>`. */
const OWNER_CONTAINER = /^union-(?<kind>[tr])(?<id>\d+)$/u;

function containerOwner(name: string): WorkspaceOwner | null {
  const groups = OWNER_CONTAINER.exec(name)?.groups;
  if (groups?.id === undefined) {
    return null;
  }
  const id = Number(groups.id);
  return groups.kind === 't' ? { ticketId: id } : { reviewId: id };
}

/**
 * Runs the preview commands, one at a time per ticket (a start and a stop never overlap). Previews
 * do not depend on the worker: they keep running when it restarts.
 */
export class PreviewManager {
  /** By owner key (`t12`, `r3`). */
  private readonly busy = new Map<string, Promise<void>>();

  constructor(private readonly deps: PreviewDeps) {}

  recover(): void {
    recoverPreviews(this.deps.db);
  }

  /** Whose e2e tests are running: one run at a time, a browser takes a lot of memory. */
  private e2eOwner: WorkspaceOwner | null = null;

  run(owner: WorkspaceOwner, action: PreviewAction): void {
    if (action === 'e2e') {
      this.e2e(owner);
      return;
    }
    this.track(owner, () => ACTIONS[action](this.deps, owner));
  }

  private e2eRefusal(): string | null {
    const owner = this.e2eOwner;
    if (owner !== null) {
      const whose = 'ticketId' in owner ? `Ticket ${owner.ticketId}'s` : "Another pull request's";
      return `${whose} end-to-end tests are running: one run at a time, they take a lot of memory`;
    }
    return this.deps.config ? null : 'The worker cannot start containers here';
  }

  private e2e(owner: WorkspaceOwner): void {
    const { config } = this.deps;
    const refusal = this.e2eRefusal();
    if (refusal !== null || !config) {
      recordE2e(this.deps.db, owner, { e2eStatus: 'skipped', e2eOutput: refusal });
      return;
    }
    this.e2eOwner = owner;
    this.track(owner, async () => {
      try {
        await runRequestedE2e({ ...this.deps, config }, owner);
      } finally {
        this.e2eOwner = null;
      }
    });
  }

  /** The owner key (`t12`, `r3`) whose e2e tests run now, if any. */
  testing(): string | null {
    return this.e2eOwner === null ? null : ownerKey(this.e2eOwner);
  }

  /** What stops the previews nobody visits, through this manager. */
  idleWatcher(): IdleWatcher {
    return new IdleWatcher({
      db: this.deps.db,
      readMetrics: () => readProxyMetrics(),
      stopIdle: (owner, minutes) => {
        this.stopIdle(owner, minutes);
      },
      testing: () => this.testing(),
    });
  }

  /** Stops a preview nobody visited for `minutes`, and says so in the ticket's log (a ticket's). */
  stopIdle(owner: WorkspaceOwner, minutes: number): void {
    this.track(owner, async () => {
      await stopPreview(this.deps, owner);
      const ticketId = ticketOwnerId(owner);
      if (ticketId !== null) {
        emitEvent(this.deps.db, {
          type: 'preview_idle_stopped',
          ticketId,
          payload: { minutes, message: `Preview stopped: nobody opened it for ${minutes} minutes` },
        });
      }
    });
  }

  /** Before a ticket's or a pull request's volumes are removed: its preview uses the workspace volume. */
  async takeDownFor(containerName: string): Promise<void> {
    const owner = containerOwner(containerName);
    if (owner !== null) {
      await this.busy.get(ownerKey(owner));
      try {
        await takeDown(this.deps, owner);
      } catch {
        // Nothing was running: the volume can go.
      }
    }
  }

  async idle(): Promise<void> {
    await Promise.all(this.busy.values());
  }

  private track(owner: WorkspaceOwner, work: () => Promise<unknown>): void {
    const key = ownerKey(owner);
    if (this.busy.has(key)) {
      const ticketId = ticketOwnerId(owner);
      if (ticketId !== null) {
        emitEvent(this.deps.db, {
          type: 'preview_busy',
          ticketId,
          payload: { message: 'The preview is busy: try again once it is done' },
        });
      }
      return;
    }
    const done = (async (): Promise<void> => {
      try {
        await work();
      } finally {
        this.busy.delete(key);
      }
    })();
    this.busy.set(key, done);
  }
}

/** The worker's manager, with the settings from its environment. */
export function createPreviewManager(deps: Omit<PreviewDeps, 'settings'>): PreviewManager {
  return new PreviewManager({ ...deps, settings: previewSettings() });
}
