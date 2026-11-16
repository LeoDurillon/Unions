// The Explain tab of a review page (after Report, counted while the agent answers), and the Explain state around it.

import type { ReactElement, ReactNode } from 'react';

import type { ReviewTarget } from '../../lib/review/review-target';
import { explainingCount, useExplanations } from '../../lib/review/use-explanations';
import type { ReviewSection } from '../review/review-page';
import { ExplainProvider } from './explain-context';
import { ExplainNotice } from './explain-notice';
import { ExplainTab } from './explain-tab';

export { ExplainOff } from './explain-context';

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

/** The review page's Explain state, and the notice after a part of the diff was added to a conversation. */
export function ExplainScope({
  target,
  onOpenTab,
  children,
}: {
  target: ReviewTarget;
  onOpenTab: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <ExplainProvider target={target} onOpenTab={onOpenTab}>
      {children}
      <ExplainNotice />
    </ExplainProvider>
  );
}
