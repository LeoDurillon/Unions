// A review's specs (its Specs bar): the list as saved and read now, saving it, the specs the agents
// get, and a whole stack's for its agent review.
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { AgentReviewSpec, SavedSpecEntry } from '@union/core';
import { stackSpecs } from '@union/core/review-spec-lists';

import type { ReviewSpecView } from '../../src/review-spec-types';
import { request } from './api';
import { reviewBase, type ReviewTarget } from './review-target';

/** The query key of a review's specs, by its API root: linking a Notion page changes them too. */
export function specsKey(base: string): string[] {
  return ['review', base, 'specs'];
}

/** The specs the agents get: those kept and readable, with their text as it is now. */
function activeSpecs(list: ReviewSpecView[] | undefined): AgentReviewSpec[] | null {
  if (!list) {
    return null;
  }
  return list.flatMap((spec) =>
    spec.removed || spec.current === null
      ? []
      : [{ kind: spec.kind, label: spec.label, text: spec.current, prs: [] }],
  );
}

/** The list as saved, the agents' specs from it, and saving a new list. */
export function useReviewSpecs(
  target: ReviewTarget,
  enabled = true,
): {
  list: UseQueryResult<ReviewSpecView[]>;
  active: AgentReviewSpec[] | null;
  save: UseMutationResult<ReviewSpecView[], Error, SavedSpecEntry[]>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const list = useQuery({
    queryKey: specsKey(base),
    queryFn: () => request<ReviewSpecView[]>('GET', `${base}/specs`),
    enabled,
  });
  const save = useMutation({
    mutationFn: (specs: SavedSpecEntry[]) =>
      request<ReviewSpecView[]>('PUT', `${base}/specs`, { specs }),
    onSuccess: (saved) => {
      queryClient.setQueryData(specsKey(base), saved);
      // A Notion page added or removed here is a link: the reviews list and the Notion tab show it.
      void queryClient.invalidateQueries({ queryKey: ['current-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['review-notion'] });
    },
  });
  return { list, active: activeSpecs(list.data), save };
}

/**
 * The stack's specs for one agent review: every member's, linked to its pull request, a page shared
 * by several once; null while one is still read.
 */
export function useStackSpecs(
  projectId: number,
  numbers: number[],
  enabled: boolean,
): AgentReviewSpec[] | null {
  const queries = useQueries({
    queries: numbers.map((number) => {
      const base = reviewBase({ kind: 'pull-request', projectId, number });
      return {
        queryKey: specsKey(base),
        queryFn: () => request<ReviewSpecView[]>('GET', `${base}/specs`),
        enabled,
      };
    }),
  });
  if (queries.some((query) => query.data === undefined)) {
    return null;
  }
  return stackSpecs(
    numbers.map((number, index) => ({
      number,
      specs: (queries[index]?.data ?? []).flatMap((spec) =>
        spec.removed || spec.current === null
          ? []
          : [{ kind: spec.kind, ref: spec.ref, label: spec.label, text: spec.current }],
      ),
    })),
  );
}
