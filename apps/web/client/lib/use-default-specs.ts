// The specs a Review with agent starts from when its last run gives none: the ticket's text, the PR's description, or each description of a stack.
import { useQueries, useQuery } from '@tanstack/react-query';
import type { AgentReviewSpec, SpecSource } from '@union/core';

import { reviewGroupingApi } from './review-grouping-api';
import type { StackPull } from './review-stack';
import { reviewBase, type ReviewTarget } from './review-target';

/** `specs` null while they are read; `reading` says what, for the dialog. */
export type DefaultSpecs = { specs: AgentReviewSpec[] | null; reading: string };

/** The ticket's text for a ticket, the pull request's description for a pull request. */
export function useDefaultSpecs(target: ReviewTarget, enabled: boolean): DefaultSpecs {
  const kind: SpecSource = target.kind === 'ticket' ? 'ticket' : 'pr';
  const base = reviewBase(target);
  const query = useQuery({
    queryKey: ['review', base, 'spec-source', kind],
    queryFn: () => reviewGroupingApi.source(base, kind),
    enabled,
    retry: false,
  });
  const reading = kind === 'ticket' ? 'the ticket' : "the pull request's description";
  if (query.isError) {
    // Nothing to start from (no description): the user adds specs, or reviews without.
    return { specs: [], reading };
  }
  const found = query.data;
  if (!found) {
    return { specs: null, reading };
  }
  return {
    specs:
      found.text.trim() === '' ? [] : [{ kind, label: found.label, text: found.text, prs: [] }],
    reading,
  };
}

/** Each pull request's description of the stack, linked to its own pull request. */
export function useStackDefaultSpecs(
  projectId: number,
  stack: StackPull[] | null,
  enabled: boolean,
): DefaultSpecs {
  const queries = useQueries({
    queries: (stack ?? []).map((pull) => {
      const base = reviewBase({ kind: 'pull-request', projectId, number: pull.number });
      return {
        queryKey: ['review', base, 'spec-source', 'pr'],
        queryFn: () => reviewGroupingApi.source(base, 'pr'),
        enabled,
        retry: false,
      };
    }),
  });
  const reading = `the ${stack?.length ?? 0} descriptions of the stack`;
  if (queries.some((query) => query.isPending)) {
    return { specs: null, reading };
  }
  const specs = (stack ?? []).flatMap((pull, index): AgentReviewSpec[] => {
    const found = queries[index]?.data;
    return found && found.text.trim() !== ''
      ? [{ kind: 'pr', label: found.label, text: found.text, prs: [pull.number] }]
      : [];
  });
  return { specs, reading };
}
