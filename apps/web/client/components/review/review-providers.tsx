// What a review page shares across its parts: the specs dialog and the files marked viewed (Explain is under its tabs).

import type { ReactElement, ReactNode } from 'react';

import { reviewBase, type ReviewTarget } from '../../lib/review/review-target';
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
    <SpecsEditingProvider>
      <ViewedProvider review={reviewBase(target)}>{children}</ViewedProvider>
    </SpecsEditingProvider>
  );
}
