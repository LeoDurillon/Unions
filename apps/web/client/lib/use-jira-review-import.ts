// Add to review on a Jira comment: the server reads it again and adds it to the ticket's review as a draft.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { JiraTabView } from '../../src/jira-comment-types';
import { request } from './api';
import { ticketReviewBase } from './review-target';

export type JiraReviewImport = {
  add: (commentId: string) => void;
  /** The comment being added, if one is. */
  adding: string | null;
  error: Error | null;
};

/** Marks the comment "In the review" and reads the ticket's review comments again. */
export function useJiraReviewImport(ticketId: number): JiraReviewImport {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (commentId: string) =>
      request<{ imported: boolean }>('POST', `/api/tickets/${ticketId}/jira-comments/import`, {
        commentId,
      }),
    onSuccess: async (_result, commentId) => {
      client.setQueryData<JiraTabView>(['jira-comments', ticketId], (old) =>
        old
          ? {
              ...old,
              review: {
                ...old.review,
                importedIds: [...new Set([...old.review.importedIds, commentId])],
              },
            }
          : old,
      );
      await client.invalidateQueries({ queryKey: ['review', ticketReviewBase(ticketId)] });
    },
  });
  return {
    add: (commentId) => {
      mutation.mutate(commentId);
    },
    adding: mutation.isPending ? mutation.variables : null,
    error: mutation.error,
  };
}
