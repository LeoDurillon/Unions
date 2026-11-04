// Runs the preview commands, one at a time per ticket (a start and a stop never overlap).
import {
  emitEvent,
  ownerKey,
  recordE2e,
  recoverPreviews,
  ticketOwnerId,
  type WorkspaceOwner,
} from '@union/core';

import type { PreviewAction, PreviewOptions } from '../commands';
import { runRequestedE2e } from '../e2e-request';
import { previewSettings } from './compose';
import { generatePreviewFile } from './compose-file';
import { failStoppedPreview, HealthWatcher } from './health';
import { IdleWatcher, readProxyMetrics } from './idle';
import { removeFinishedPreview, resetPreview } from './reset';
import { startOwnerPreview, updateReviewPreview } from './review-preview';
import { refreshPreviewLogs, stopPreview, takeDown, type PreviewDeps } from './run';

type Action = (
  deps: PreviewDeps,
  owner: WorkspaceOwner,
  options: PreviewOptions,
) => Promise<unknown>;

/**
 * A pull request's start checks it out first; only a pull request's checkout can be updated. A reset
 * drops everything the preview holds and starts it again.
 */
const ACTIONS: Record<Exclude<PreviewAction, 'e2e'>, Action> = {
  start: startOwnerPreview,
  stop: stopPreview,
  reset: (deps, owner, options) => resetPreview(deps, owner, options.folders),
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
  /** The starts in progress, by owner key: a stop asked meanwhile aborts them. */
  private readonly starting = new Map<string, AbortController>();

  constructor(private readonly deps: PreviewDeps) {}

  recover(): void {
    recoverPreviews(this.deps.db);
  }

  /** Whose e2e tests are running: one run at a time, a browser takes a lot of memory. */
  private e2eOwner: WorkspaceOwner | null = null;

  run(owner: WorkspaceOwner, action: PreviewAction, options: PreviewOptions = {}): void {
    if (action === 'e2e') {
      this.e2e(owner);
      return;
    }
    if (action === 'start') {
      this.start(owner, options);
      return;
    }
    const start = this.starting.get(ownerKey(owner));
    if (action === 'stop' && start !== undefined) {
      start.abort();
      return;
    }
    this.track(owner, () => ACTIONS[action](this.deps, owner, options));
  }

  /** A start a stop can abort: what it brought up is taken down and the preview is stopped. */
  private start(owner: WorkspaceOwner, options: PreviewOptions): void {
    const key = ownerKey(owner);
    const controller = new AbortController();
    this.track(owner, async () => {
      this.starting.set(key, controller);
      try {
        await ACTIONS.start({ ...this.deps, signal: controller.signal }, owner, options);
      } finally {
        this.starting.delete(key);
      }
    });
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

  /** What watches the running previews: stops those nobody visits, fails those whose services stopped. */
  watchers(): { tick: () => void } {
    const watchers = [this.idleWatcher(), this.healthWatcher()];
    return {
      tick: () => {
        for (const watcher of watchers) {
          watcher.tick();
        }
      },
    };
  }

  /** What fails the running previews whose exposed services stopped, through this manager. */
  private healthWatcher(): HealthWatcher {
    return new HealthWatcher({
      db: this.deps.db,
      runtime: this.deps.runtime,
      onStopped: (owner) => {
        // Busy (a start, a stop, its tests): what runs then decides its state.
        if (!this.busy.has(ownerKey(owner))) {
          this.track(owner, () => failStoppedPreview(this.deps, owner));
        }
      },
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

  /**
   * Takes a finished ticket's preview down with its built images: false, and nothing done, while
   * a command on it runs (the next pass tries again). A failure is thrown.
   */
  async removeFinished(ticketId: number): Promise<boolean> {
    const owner = { ticketId };
    const key = ownerKey(owner);
    if (this.busy.has(key)) {
      return false;
    }
    const removal = (async (): Promise<Error | null> => {
      try {
        await removeFinishedPreview(this.deps, owner);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      } finally {
        this.busy.delete(key);
      }
    })();
    this.busy.set(
      key,
      (async (): Promise<void> => {
        await removal;
      })(),
    );
    const failure = await removal;
    if (failure !== null) {
      throw failure;
    }
    return true;
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
