import { useState, type ReactElement } from 'react';

import { Segmented, type SegmentOption } from '../choice';
import type { DiffView } from './file-diff';

export type { DiffView } from './file-diff';

const STORAGE_KEY = 'union.review.view';
const VIEWS: SegmentOption<DiffView>[] = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
];

function stored(): DiffView {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

/** The diff layout, remembered in this browser. */
export function useDiffView(): [DiffView, (view: DiffView) => void] {
  const [view, setView] = useState<DiffView>(stored);
  const choose = (next: DiffView): void => {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [view, choose];
}

/** Unified / Split switch for the review diff. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: DiffView;
  onChange: (view: DiffView) => void;
}): ReactElement {
  return <Segmented legend="Diff layout" options={VIEWS} value={view} onChange={onChange} />;
}
