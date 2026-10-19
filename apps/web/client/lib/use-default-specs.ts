// The specs a Review with agent starts from when its last run gives none: the ticket's text, the PR's description and its linked Notion page, or each of a stack's.
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { AgentReviewSpec, SpecSource } from '@union/core';

import type { SpecText } from '../../src/routes/spec-sources';
import { reviewGroupingApi } from './review-grouping-api';
import { useLinkedNotionPage } from './review-notion-context';
import type { StackPull } from './review-stack';
import { reviewBase, type ReviewTarget } from './review-target';

/** `specs` null while they are read; `reading` says what, for the dialog. */
export type DefaultSpecs = { specs: AgentReviewSpec[] | null; reading: string };

/** One source of one review; `page` keys a linked Notion page, read again when the link changes. */
type Read = { base: string; kind: SpecSource; prs: number[]; page?: string };

function readQuery(
  read: Read,
  enabled: boolean,
): { queryKey: unknown[]; queryFn: () => Promise<SpecText>; enabled: boolean; retry: false } {
  return {
    queryKey: ['review', read.base, 'spec-source', read.kind, read.page ?? null],
    queryFn: () => reviewGroupingApi.source(read.base, read.kind),
    enabled,
    retry: false,
  };
}

/**
 * The specs the reads gave, in their order. One that failed (no description, a page no longer
 * shared) is left out: the user adds specs, or reviews without.
 */
function specsOf(reads: Read[], queries: UseQueryResult<SpecText>[]): AgentReviewSpec[] | null {
  if (queries.some((query) => query.isPending)) {
    return null;
  }
  return reads.flatMap((read, index): AgentReviewSpec[] => {
    const found = queries[index]?.data;
    return found && found.text.trim() !== ''
      ? [{ kind: read.kind, label: found.label, text: found.text, prs: read.prs }]
      : [];
  });
}

/** The ticket's text for a ticket; the pull request's description, and its linked page, for one. */
export function useDefaultSpecs(target: ReviewTarget, enabled: boolean): DefaultSpecs {
  const notionPageId = useLinkedNotionPage();
  const base = reviewBase(target);
  const notion: Read[] = notionPageId
    ? [{ base, kind: 'notion', prs: [], page: notionPageId }]
    : [];
  const reads: Read[] =
    target.kind === 'ticket'
      ? [{ base, kind: 'ticket', prs: [] }]
      : [{ base, kind: 'pr', prs: [] }, ...notion];
  const queries = useQueries({ queries: reads.map((read) => readQuery(read, enabled)) });
  let reading = 'the ticket';
  if (target.kind === 'pull-request') {
    reading = notionPageId
      ? "the pull request's description and its Notion page"
      : "the pull request's description";
  }
  return { specs: specsOf(reads, queries), reading };
}

/**
 * Each pull request's description of the stack, linked to its own pull request, then each linked
 * Notion page once, linked to every pull request linked to it.
 */
export function useStackDefaultSpecs(
  projectId: number,
  stack: StackPull[] | null,
  enabled: boolean,
): DefaultSpecs {
  const pulls = stack ?? [];
  const baseOf = (number: number): string =>
    reviewBase({ kind: 'pull-request', projectId, number });
  const pages = [...new Set(pulls.flatMap((pull) => pull.notionPageId ?? []))];
  const reads: Read[] = [
    ...pulls.map((pull): Read => ({ base: baseOf(pull.number), kind: 'pr', prs: [pull.number] })),
    ...pages.map((page): Read => {
      const linked = pulls.filter((pull) => pull.notionPageId === page).map((pull) => pull.number);
      // Read through the first pull request linked to it: the server reads that one's link.
      return { base: baseOf(linked[0] ?? 0), kind: 'notion', prs: linked, page };
    }),
  ];
  const queries = useQueries({ queries: reads.map((read) => readQuery(read, enabled)) });
  const also = pages.length > 0 ? ` and ${pages.length} Notion page(s)` : '';
  return {
    specs: specsOf(reads, queries),
    reading: `the ${pulls.length} descriptions of the stack${also}`,
  };
}
