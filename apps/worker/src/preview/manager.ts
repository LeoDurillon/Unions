import { emitEvent, previewProject, recoverPreviews } from '@union/core';

import type { PreviewAction } from '../commands';
import { generatePreviewFile } from './compose-file';
import { refreshPreviewLogs, startPreview, stopPreview, takeDown, type PreviewDeps } from './run';

const ACTIONS: Record<PreviewAction, (deps: PreviewDeps, ticketId: number) => Promise<void>> = {
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

  run(ticketId: number, action: PreviewAction): void {
    this.track(ticketId, () => ACTIONS[action](this.deps, ticketId));
  }

  /** Before a ticket's volumes are removed: its preview uses the workspace volume. */
  async takeDownFor(containerName: string): Promise<void> {
    const id = TICKET_CONTAINER.exec(containerName)?.groups?.id;
    if (id !== undefined) {
      await this.busy.get(Number(id));
      try {
        await takeDown(this.deps, previewProject(Number(id)));
      } catch {
        // Nothing was running: the volume can go.
      }
    }
  }

  async idle(): Promise<void> {
    await Promise.all(this.busy.values());
  }

  private track(ticketId: number, work: () => Promise<void>): void {
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
