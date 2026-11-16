// The Explain tab of a review page: after the Report tab (else last before the diff), counted while the agent answers.

import type { ReviewTarget } from '../../lib/review/review-target';
import { explainingCount, useExplanations } from '../../lib/review/use-explanations';
import type { ReviewSection } from '../review/review-page';
import { ExplainTab } from './explain-tab';

export { ExplainOff, ExplainProvider } from './explain-context';

export const EXPLAIN_TAB = 'explain';

export function useExplainSection(target: ReviewTarget): ReviewSection {
  const count = explainingCount(useExplanations(target).explanations.data ?? []);
  return {
    id: EXPLAIN_TAB,
    label: count > 0 ? `Explain (${count})` : 'Explain',
    wide: true,
    content: ({ openDiff }) => <ExplainTab openDiff={openDiff} />,
  };
}

/** The page's tabs with Explain after Report, or at their end. */
export function withExplain(sections: ReviewSection[], explain: ReviewSection): ReviewSection[] {
  const at = sections.findIndex((section) => section.id === 'report');
  return at === -1
    ? [...sections, explain]
    : [...sections.slice(0, at + 1), explain, ...sections.slice(at + 1)];
}
