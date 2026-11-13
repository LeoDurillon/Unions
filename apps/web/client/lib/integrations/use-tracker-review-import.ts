// Add to review on a tracker's thread, or on one comment of it. The server reads it again and adds it to the
// ticket's review as a draft.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { TrackerCommentsView } from '../../../src/tracker-comment-types';
import { request } from '../app/api';
import { ticketReviewBase } from '../review/review-target';
import { trackerCommentsKey } from './use-tracker-comments';

/** A whole thread, or only one of its comments. */
type ImportTarget = { threadId: string; commentId: string | null };

export type TrackerReviewImport = {
  add: (target: ImportTarget) => void;
  /** The id of the thread (or comment) being added, if one is. */
  adding: string | null;
  error: Error | null;
};

function idOf(target: ImportTarget): string {
  return target.commentId ?? target.threadId;
}

/** Marks the thread (or comment) "In the review" and reads the ticket's review comments again. */
export function useTrackerReviewImport(
  ticketId: number,
  kind: IntegrationKindName,
): TrackerReviewImport {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: ImportTarget) =>
      request<{ imported: boolean }>(
        'POST',
        `/api/tickets/${ticketId}/trackers/${kind}/comments/import`,
        target,
      ),
    onSuccess: async (_result, target) => {
      client.setQueryData<TrackerCommentsView>(trackerCommentsKey(ticketId, kind), (old) =>
        old
          ? {
              ...old,
              review: {
                ...old.review,
                importedIds: [...new Set([...old.review.importedIds, idOf(target)])],
              },
            }
          : old,
      );
      await client.invalidateQueries({ queryKey: ['review', ticketReviewBase(ticketId)] });
    },
  });
  return {
    add: (target) => {
      mutation.mutate(target);
    },
    adding: mutation.isPending ? idOf(mutation.variables) : null,
    error: mutation.error,
  };
}
