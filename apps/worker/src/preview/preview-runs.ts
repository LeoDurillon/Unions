// The preview work beside the pipeline: the manager running preview commands, its watchers (idle
// and stopped previews), and the cleanup of finished tickets' previews, containers and volumes.

import { TicketCleanup } from '../ticket-cleanup';
import { createPreviewManager, type PreviewManager } from './manager';
import type { PreviewDeps } from './run';

export type PreviewRuns = {
  previews: PreviewManager;
  tick: () => void;
  idle: () => Promise<void>;
};

/** The preview manager, what watches its previews, and the cleanup of finished tickets. */
export function startPreviewRuns(deps: Omit<PreviewDeps, 'settings'>): PreviewRuns {
  const previews = createPreviewManager(deps);
  previews.recover();
  const watchers = previews.watchers();
  const cleanup = new TicketCleanup({
    db: deps.db,
    runtime: deps.runtime,
    removePreview: (ticketId) => previews.removeFinished(ticketId),
  });
  return {
    previews,
    tick: () => {
      watchers.tick();
      cleanup.tick();
    },
    idle: async () => {
      await Promise.all([previews.idle(), cleanup.idle()]);
    },
  };
}
