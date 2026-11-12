// Asks the worker to resync the ticket's workspace onto its branch on GitHub: queued, done when its event comes in.

import { useQueryClient } from '@tanstack/react-query';

import { request } from '../app/api';
import { useQueuedWork } from './use-queued-work';

export type BranchResync = {
  resync: () => void;
  /** Sent, or queued and the worker has not finished it yet. */
  busy: boolean;
  error: Error | null;
};

export function useBranchResync(ticketId: number): BranchResync {
  const queryClient = useQueryClient();
  const work = useQueuedWork<void>({
    ticketId,
    send: (): Promise<unknown> => request('POST', `/api/tickets/${ticketId}/resync`, {}),
    events: { done: 'branch_resynced', failed: 'branch_resync_failed' },
    fallback: 'The branch was not resynced',
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });
  return {
    resync: () => {
      work.start();
    },
    busy: work.busy,
    error: work.error,
  };
}
