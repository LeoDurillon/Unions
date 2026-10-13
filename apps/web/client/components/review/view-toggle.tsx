import { useState, type ReactElement } from 'react';

import type { DiffView } from './file-diff';

export type { DiffView } from './file-diff';

const STORAGE_KEY = 'union.review.view';
const VIEWS: { view: DiffView; label: string }[] = [
  { view: 'unified', label: 'Unified' },
  { view: 'split', label: 'Split' },
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
  return (
    <fieldset className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
      <legend className="sr-only">Diff layout</legend>
      {VIEWS.map((entry) => (
        <button
          key={entry.view}
          type="button"
          aria-pressed={entry.view === view}
          onClick={() => {
            onChange(entry.view);
          }}
          className={`rounded px-2.5 py-1 text-xs transition ${entry.view === view ? 'bg-indigo-100 font-medium dark:bg-indigo-950' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {entry.label}
        </button>
      ))}
    </fieldset>
  );
}
