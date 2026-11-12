// The Jira issues of a pull request under review: their text and comments, the suggestions, checking, linking, unlinking.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewJiraIssue, ReviewJiraLink } from '../../../src/review-jira-types';
import { request } from '../app/api';
import { reviewBase } from './review-target';
import { specsKey } from './use-review-specs';

const SPECS = specsKey('').at(-1);

function jiraPath(review: CurrentReview): string {
  return `${reviewBase({ kind: 'pull-request', projectId: review.projectId, number: review.prNumber })}/jira`;
}

/** The linked issues, as a key: read again when one is linked or unlinked. */
function issuesKey(review: CurrentReview): string {
  return review.jiraIssues.map((issue) => issue.id).join(',');
}

/** Read from Jira once per opening of the tab; `refetch` is its Refresh. */
export function useReviewJiraIssues(review: CurrentReview): UseQueryResult<ReviewJiraIssue[]> {
  return useQuery({
    queryKey: ['review-jira', review.projectId, review.prNumber, issuesKey(review)],
    queryFn: () => request<ReviewJiraIssue[]>('GET', jiraPath(review)),
    staleTime: Infinity,
    retry: false,
  });
}

/** The project's issues the pull request names (title, branch, description), readable and not linked. */
export function useReviewJiraSuggestions(
  review: CurrentReview,
  enabled: boolean,
): UseQueryResult<ReviewJiraLink[]> {
  return useQuery({
    queryKey: ['review-jira-suggestions', review.projectId, review.prNumber, issuesKey(review)],
    queryFn: () => request<ReviewJiraLink[]>('GET', `${jiraPath(review)}/suggestions`),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export type ReviewJiraActions = {
  check: UseMutationResult<ReviewJiraLink, Error, string>;
  link: UseMutationResult<ReviewJiraLink, Error, string>;
  unlink: UseMutationResult<unknown, Error, string>;
};

/** Linking and unlinking refresh the reviews list (it carries the issues) and the review's specs. */
export function useReviewJiraLink(review: CurrentReview): ReviewJiraActions {
  const queryClient = useQueryClient();
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['current-reviews', review.projectId] });
    await queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === SPECS });
  };
  return {
    check: useMutation({
      mutationFn: (issue: string) =>
        request<ReviewJiraLink>('POST', `${jiraPath(review)}/check`, { issue }),
    }),
    link: useMutation({
      mutationFn: (issue: string) => request<ReviewJiraLink>('PUT', jiraPath(review), { issue }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: (key: string) =>
        request('DELETE', `${jiraPath(review)}/${encodeURIComponent(key)}`),
      onSuccess: refresh,
    }),
  };
}
