import { useState, type ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewGrouping } from '../../lib/use-review-grouping';
import { draftCounts } from './file-row';
import { FileRows, type Layout } from './file-rows';
import { SpecGroups } from './spec-groups';

const STORAGE_KEY = 'union.review.files';
const BY_SPEC_KEY = 'union.review.bySpec';
const LAYOUTS: { layout: Layout; label: string }[] = [
  { layout: 'list', label: 'List' },
  { layout: 'tree', label: 'Tree' },
];

function stored(): Layout {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'tree' ? 'tree' : 'list';
  } catch {
    return 'list';
  }
}

/** The file list's layout, remembered in this browser. */
function useLayout(): [Layout, (layout: Layout) => void] {
  const [layout, setLayout] = useState<Layout>(stored);
  const choose = (next: Layout): void => {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [layout, choose];
}

function storedBySpec(): boolean {
  try {
    return localStorage.getItem(BY_SPEC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Whether the files show under their spec groups, remembered in this browser (on unless turned off). */
function useBySpec(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(storedBySpec);
  const choose = (next: boolean): void => {
    setOn(next);
    try {
      localStorage.setItem(BY_SPEC_KEY, next ? 'on' : 'off');
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  };
  return [on, choose];
}

function BySpecToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Group the files by the parts of the specification they implement"
      onClick={() => {
        onChange(!on);
      }}
      className={`rounded-md border px-2 py-0.5 text-xs transition ${on ? 'border-indigo-300 bg-indigo-100 font-medium dark:border-indigo-800 dark:bg-indigo-950' : 'border-zinc-300 text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100'}`}
    >
      By spec
    </button>
  );
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}): ReactElement {
  return (
    <fieldset className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
      <legend className="sr-only">File list layout</legend>
      {LAYOUTS.map((entry) => (
        <button
          key={entry.layout}
          type="button"
          aria-pressed={entry.layout === layout}
          onClick={() => {
            onChange(entry.layout);
          }}
          className={`rounded px-2 py-0.5 text-xs transition ${entry.layout === layout ? 'bg-indigo-100 font-medium dark:bg-indigo-950' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {entry.label}
        </button>
      ))}
    </fieldset>
  );
}

/** The touched files, as a list or a tree; ignored ones (lock files, project patterns) are listed apart, collapsed. */
export function FileList({
  files,
  comments,
  selected,
  onSelect,
  target,
}: {
  files: DiffFileSummary[];
  comments: CommentView[];
  selected: number | null;
  onSelect: (id: number) => void;
  /** Whose grouping by spec to show: its files under their groups when "By spec" is on. */
  target: ReviewTarget;
}): ReactElement {
  const grouping = useReviewGrouping(target).grouping.data ?? null;
  const [layout, setLayout] = useLayout();
  const [bySpec, setBySpec] = useBySpec();
  const grouped = grouping?.status === 'succeeded' && grouping.result !== null;
  const drafts = draftCounts(comments);
  const shown = files.filter((file) => !file.ignored);
  const ignored = files.filter((file) => file.ignored);
  const openIgnored = ignored.some((file) => file.id === selected);
  const rows = { drafts, selected, onSelect, layout };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs text-zinc-500">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-1">
          {grouped ? <BySpecToggle on={bySpec} onChange={setBySpec} /> : null}
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>
      </div>
      {grouped && bySpec ? (
        <SpecGroups files={shown} grouping={grouping} rows={rows} />
      ) : (
        <FileRows files={shown} {...rows} />
      )}
      {ignored.length > 0 ? (
        <details open={openIgnored} className="text-xs text-zinc-500">
          <summary className="cursor-pointer px-2">
            {ignored.length} ignored file{ignored.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-1 opacity-70">
            <FileRows files={ignored} {...rows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
