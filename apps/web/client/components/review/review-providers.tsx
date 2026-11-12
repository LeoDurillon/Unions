// What a review page shares across its parts: the Explain panel, the specs dialog, and the files marked viewed.

import type { ReactElement, ReactNode } from 'react';

import { reviewBase, type ReviewTarget } from '../../lib/review/review-target';
import { ExplainProvider } from './explain-context';
import { SpecsEditingProvider } from './specs-editing';
import { ViewedProvider } from './viewed-context';

export function ReviewProviders({
  target,
  children,
}: {
  target: ReviewTarget;
  children: ReactNode;
}): ReactElement {
  return (
    <ExplainProvider target={target}>
      <SpecsEditingProvider>
        <ViewedProvider review={reviewBase(target)}>{children}</ViewedProvider>
      </SpecsEditingProvider>
    </ExplainProvider>
  );
}
