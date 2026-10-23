import { useState, type ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';
import { reviewSlice, type ReviewTarget } from '../../lib/review-target';
import { useReviewGrouping } from '../../lib/use-review-grouping';
import { Segmented, type SegmentOption } from '../choice';
import { draftCounts } from './file-row';
import { FileRows, type RowOptions, type Layout } from './file-rows';
import { SpecGroups } from './spec-groups';

const STORAGE_KEY = 'union.review.files';
const BY_SPEC_KEY = 'union.review.bySpec';
const LAYOUTS: SegmentOption<Layout>[] = [
  { value: 'list', label: 'List' },
  { value: 'tree', label: 'Tree' },
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

/** The files matched by the review ignore rules, collapsed unless one of them is open. */
function IgnoredFiles({
  files,
  rows,
}: {
  files: DiffFileSummary[];
  rows: RowOptions;
}): ReactElement | null {
  if (files.length === 0) {
    return null;
  }
  return (
    <details
      open={files.some((file) => file.id === rows.selected)}
      className="text-xs text-zinc-500"
    >
      <summary className="cursor-pointer px-2">
        {files.length} ignored file{files.length === 1 ? '' : 's'}
      </summary>
      <div className="mt-1 opacity-70">
        <FileRows files={files} {...rows} />
      </div>
    </details>
  );
}

/** The touched files, as a list or a tree; ignored ones (lock files, project patterns) are listed apart, collapsed. */
export function FileList({
  files,
  comments,
  selected,
  onSelect,
  part = null,
  target,
  allowBySpec = true,
}: {
  files: DiffFileSummary[];
  comments: CommentView[];
  selected: number | null;
  /** `part`: the part of the spec the file was picked under (By spec), else null. */
  onSelect: (id: number, part: string | null) => void;
  /** The part the open file was picked under: only its rows show it open. */
  part?: string | null;
  /** Whose grouping by spec to show: its files under their groups when "By spec" is on. */
  target: ReviewTarget;
  /** False on a single commit: the grouping is made for the whole change. */
  allowBySpec?: boolean;
}): ReactElement {
  const grouping = useReviewGrouping(target).grouping.data ?? null;
  const [layout, setLayout] = useLayout();
  const [bySpec, setBySpec] = useBySpec();
  // A slice's files are its own change: the grouping is the whole change's.
  const whole = allowBySpec && reviewSlice(target) === null;
  const grouped = whole && grouping?.status === 'succeeded' && grouping.result !== null;
  const drafts = draftCounts(comments);
  const shown = files.filter((file) => !file.ignored);
  const ignored = files.filter((file) => file.ignored);
  const rows = {
    drafts,
    selected,
    onSelect: (id: number) => {
      onSelect(id, null);
    },
    layout,
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="text-xs text-zinc-500">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-1">
          {grouped ? <BySpecToggle on={bySpec} onChange={setBySpec} /> : null}
          <Segmented
            legend="File list layout"
            options={LAYOUTS}
            value={layout}
            onChange={setLayout}
          />
        </div>
      </div>
      {grouped && bySpec ? (
        <SpecGroups files={shown} grouping={grouping} rows={rows} part={part} onPick={onSelect} />
      ) : (
        <FileRows files={shown} {...rows} />
      )}
      <IgnoredFiles files={ignored} rows={rows} />
    </div>
  );
}
