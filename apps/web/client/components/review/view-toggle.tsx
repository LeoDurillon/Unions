// The Unified / Split switch for the review diff, and the Explain panel's toggle (in the agent group).
import { useState, type ReactElement } from 'react';

import { isExplaining, useExplanations } from '../../lib/use-explanations';
import { Segmented, type SegmentOption } from '../choice';
import { useExplain, type ExplainState } from './explain-context';
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

function ExplainButton({ explain }: { explain: ExplainState }): ReactElement {
  const rows = useExplanations(explain.target).explanations.data ?? [];
  const running = rows.filter((row) => isExplaining(row)).length;
  return (
    <button
      type="button"
      aria-pressed={explain.open}
      aria-label={`Explain panel${running > 0 ? `, ${running} on the way` : ''}`}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${explain.open ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'}`}
      onClick={() => {
        explain.setOpen(!explain.open);
      }}
    >
      Explain{running > 0 ? ` (${running})` : ''}
    </button>
  );
}

/** Opens and closes the Explain panel, with how many explanations are on the way. */
export function ExplainToggle(): ReactElement | null {
  const explain = useExplain();
  return explain ? <ExplainButton explain={explain} /> : null;
}

/** The Unified / Split switch for the review diff. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: DiffView;
  onChange: (view: DiffView) => void;
}): ReactElement {
  return <Segmented legend="Diff layout" options={VIEWS} value={view} onChange={onChange} />;
}
