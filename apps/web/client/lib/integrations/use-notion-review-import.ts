// Add to review on a Notion discussion, or on one comment of the page's. The server reads it again
// and adds it to the ticket's review as a draft.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { NotionTabView } from '../../../src/notion-discussion-types';
import { request } from '../app/api';
import { ticketReviewBase } from '../review/review-target';

/** A whole discussion, or only one of its comments. */
type ImportTarget = { discussionId: string; commentId: string | null };

export type NotionReviewImport = {
  add: (target: ImportTarget) => void;
  /** The id of the discussion (or comment) being added, if one is. */
  adding: string | null;
  error: Error | null;
};

function idOf(target: ImportTarget): string {
  return target.commentId ?? target.discussionId;
}

/** Marks the discussion (or comment) "In the review" and reads the ticket's review comments again. */
export function useNotionReviewImport(ticketId: number): NotionReviewImport {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: ImportTarget) =>
      request<{ imported: boolean }>(
        'POST',
        `/api/tickets/${ticketId}/notion-comments/import`,
        target,
      ),
    onSuccess: async (_result, target) => {
      client.setQueryData<NotionTabView>(['notion-comments', ticketId], (old) =>
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
