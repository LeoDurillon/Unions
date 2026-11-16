// The lines the review's diff shows picked: opened from Explain or a report, or asked by the URL (`?lines=`).

import { useEffect } from 'react';

import { useUrlParam } from '../../lib/app/url-state';
import type { Selection } from '../../lib/review/diff-selection';
import { diffLinesOf } from '../../lib/review/review-url';

/** Lines to pick in the diff (opening a cited line), with a comment to start on them. */
export type ExplainFocus = Selection & { path: string; draft: string | null; seq: number };

type SetFocus = (next: (last: ExplainFocus | null) => ExplainFocus) => void;

/** Shows the lines the URL asks for (`?lines=`, a line comment's link from the PR tab). */
export function useAskedLines(setFocus: SetFocus): void {
  const asked = useUrlParam('lines');
  useEffect(() => {
    const lines = diffLinesOf(asked);
    if (lines) {
      setFocus((last) => ({ ...lines, draft: null, seq: (last?.seq ?? 0) + 1 }));
    }
  }, [asked, setFocus]);
}
