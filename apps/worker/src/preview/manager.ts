import { emitEvent, recordE2e, recoverPreviews } from '@union/core';

import type { PreviewAction } from '../commands';
import { runRequestedE2e } from '../e2e';
import { generatePreviewFile } from './compose-file';
import { refreshPreviewLogs, startPreview, stopPreview, takeDown, type PreviewDeps } from './run';

const ACTIONS: Record<
  Exclude<PreviewAction, 'e2e'>,
  (deps: PreviewDeps, ticketId: number) => Promise<unknown>
> = {
  start: startPreview,
  stop: stopPreview,
  logs: refreshPreviewLogs,
  generate: generatePreviewFile,
};

/** Container names of ticket previews' owners: a ticket's own container is `union-t<id>`. */
const TICKET_CONTAINER = /^union-t(?<id>\d+)$/u;

/**
 * Runs the preview commands, one at a time per ticket (a start and a stop never overlap). Previews
 * do not depend on the worker: they keep running when it restarts.
 */
export class PreviewManager {
  private readonly busy = new Map<number, Promise<void>>();

  constructor(private readonly deps: PreviewDeps) {}

  recover(): void {
    recoverPreviews(this.deps.db);
  }

  /** The ticket whose e2e tests are running: one at a time, a browser takes a lot of memory. */
  private e2eTicket: number | null = null;

  run(ticketId: number, action: PreviewAction): void {
    if (action === 'e2e') {
      this.e2e(ticketId);
      return;
    }
    this.track(ticketId, () => ACTIONS[action](this.deps, ticketId));
  }

  private e2e(ticketId: number): void {
    const { config } = this.deps;
    if (this.e2eTicket !== null || !config) {
      recordE2e(this.deps.db, ticketId, {
        e2eStatus: 'skipped',
        e2eOutput: config
          ? `Ticket ${this.e2eTicket}'s end-to-end tests are running: one run at a time, they take a lot of memory`
          : 'The worker cannot start ticket containers here',
      });
      return;
    }
    this.e2eTicket = ticketId;
    this.track(ticketId, async () => {
      try {
        await runRequestedE2e({ ...this.deps, config }, ticketId);
      } finally {
        this.e2eTicket = null;
      }
    });
  }

  /** Before a ticket's volumes are removed: its preview uses the workspace volume. */
  async takeDownFor(containerName: string): Promise<void> {
    const id = TICKET_CONTAINER.exec(containerName)?.groups?.id;
    if (id !== undefined) {
      await this.busy.get(Number(id));
      try {
        await takeDown(this.deps, Number(id));
      } catch {
        // Nothing was running: the volume can go.
      }
    }
  }

  async idle(): Promise<void> {
    await Promise.all(this.busy.values());
  }

  private track(ticketId: number, work: () => Promise<unknown>): void {
    if (this.busy.has(ticketId)) {
      emitEvent(this.deps.db, {
        type: 'preview_busy',
        ticketId,
        payload: { message: 'The preview is busy: try again once it is done' },
      });
      return;
    }
    const done = (async (): Promise<void> => {
      try {
        await work();
      } finally {
        this.busy.delete(ticketId);
      }
    })();
    this.busy.set(ticketId, done);
  }
}
