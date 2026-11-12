// The review page's slice, section tab, diff lines and ticketless pull request in the URL, for
// Back, Forward and reload. The slice and tab (`?slice=2&tab=pull-request`), the lines its diff
// opens on (`?lines=new:12-30:src/a.ts`), and the pull request reviewed without a ticket
// (`?review-pr=42`) are kept there, so Back and Forward move between them and a reload keeps them.

import { useCallback } from 'react';

import type { Selection } from '../diff-selection';
import { readParam, setParams, useUrlParam } from '../url-state';

/** Spread into `setParams` wherever the review closes, so its slice, tab and lines do not outlive it. */
export const CLOSE_REVIEW = {
  review: null,
  slice: null,
  tab: null,
  lines: null,
  'review-pr': null,
} as const;

/** Lines of a file for the diff to open on. */
export type DiffLines = Selection & { path: string };

/** The review page a link opens: the open ticket's, or the pull request's under review. */
export type ReviewPageKind = 'ticket' | 'pull-request';

/**
 * Opens the review's Diff tab on the lines (`?tab=diff&lines=…`); a ticket's review page opens
 * first when the link is in its panel.
 */
export function openDiffLines({ path, side, start, end }: DiffLines, page: ReviewPageKind): void {
  setParams({
    ...(page === 'ticket' ? { review: '1' } : {}),
    tab: 'diff',
    lines: `${side}:${start}-${end}:${path}`,
  });
}

/** The lines `?lines=` names; null when absent or malformed. */
export function diffLinesOf(value: string | null): DiffLines | null {
  const groups =
    value === null
      ? undefined
      : /^(?<side>old|new):(?<start>\d+)-(?<end>\d+):(?<path>.+)$/u.exec(value)?.groups;
  const { side, start, end, path } = groups ?? {};
  if (path === undefined || (side !== 'old' && side !== 'new')) {
    return null;
  }
  return { path, side, start: Number(start), end: Number(end) };
}

/** A slice position (`1` = bottom) or a pull request number from the URL; null for anything else. */
export function positiveOf(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) {
    return null;
  }
  const position = Number(value);
  return position > 0 ? position : null;
}

/** Sets the parameter as a new history entry, unless it already holds that value. */
function push(name: string, value: string | null): void {
  if (readParam(name) !== value) {
    setParams({ [name]: value });
  }
}

/** The slice a split ticket's review shows (`?slice=2`); null is All. */
export function useReviewSlice(): [number | null, (slice: number | null) => void] {
  const slice = positiveOf(useUrlParam('slice'));
  const set = useCallback((next: number | null): void => {
    push('slice', next === null ? null : String(next));
  }, []);
  return [slice, set];
}

/** The ticket review's section tab (`?tab=report`); null is the page's own first tab. */
export function useReviewTab(): { id: string | null; set: (id: string) => void } {
  const id = useUrlParam('tab');
  const set = useCallback((next: string): void => {
    if (readParam('tab') !== next) {
      // Lines asked for earlier are done with: asking for them again opens them again.
      setParams({ tab: next, lines: null });
    }
  }, []);
  return { id, set };
}

/**
 * The pull request under review without a ticket whose review page is open (`?review-pr=42`); null
 * when none. Another one opens on its first tab.
 */
export function useReviewedPullRequest(): [number | null, (pr: number | null) => void] {
  const pr = positiveOf(useUrlParam('review-pr'));
  const set = useCallback((next: number | null): void => {
    const value = next === null ? null : String(next);
    if (readParam('review-pr') !== value) {
      setParams({ 'review-pr': value, tab: null, lines: null });
    }
  }, []);
  return [pr, set];
}
