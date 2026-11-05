// Add to review on a Notion discussion: the server reads it again and adds it to the ticket's review as a draft.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { NotionTabView } from '../../src/notion-discussion-types';
import { request } from './api';
import { ticketReviewBase } from './review-target';

export type NotionReviewImport = {
  add: (discussionId: string) => void;
  /** The discussion being added, if one is. */
  adding: string | null;
  error: Error | null;
};

/** Marks the discussion "In the review" and reads the ticket's review comments again. */
export function useNotionReviewImport(ticketId: number): NotionReviewImport {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (discussionId: string) =>
      request<{ imported: boolean }>('POST', `/api/tickets/${ticketId}/notion-comments/import`, {
        discussionId,
      }),
    onSuccess: async (_result, discussionId) => {
      client.setQueryData<NotionTabView>(['notion-comments', ticketId], (old) =>
        old
          ? {
              ...old,
              review: {
                ...old.review,
                importedIds: [...new Set([...old.review.importedIds, discussionId])],
              },
            }
          : old,
      );
      await client.invalidateQueries({ queryKey: ['review', ticketReviewBase(ticketId)] });
    },
  });
  return {
    add: (discussionId) => {
      mutation.mutate(discussionId);
    },
    adding: mutation.isPending ? mutation.variables : null,
    error: mutation.error,
  };
}
