// The review page's slice and section tab in the URL (`?slice=2&tab=pull-request`), so Back and
// Forward move between them and a reload keeps them.
import { useCallback } from 'react';

import { readParam, setParams, useUrlParam } from './url-state';

/** Spread into `setParams` wherever the review closes, so its slice and tab do not outlive it. */
export const CLOSE_REVIEW = { review: null, slice: null, tab: null } as const;

/** A slice position (`1` = bottom) from the URL; null (All) for anything else. */
export function slicePositionOf(value: string | null): number | null {
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
  const slice = slicePositionOf(useUrlParam('slice'));
  const set = useCallback((next: number | null): void => {
    push('slice', next === null ? null : String(next));
  }, []);
  return [slice, set];
}

/** The ticket review's section tab (`?tab=report`); null is the page's own first tab. */
export function useReviewTab(): { id: string | null; set: (id: string) => void } {
  const id = useUrlParam('tab');
  const set = useCallback((next: string): void => {
    push('tab', next);
  }, []);
  return { id, set };
}
