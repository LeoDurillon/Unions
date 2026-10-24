// The touched files, as a list or a tree; ignored ones (lock files, project patterns) are listed
// apart, collapsed.
import { useState, type ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';
import { reviewSlice, type ReviewTarget } from '../../lib/review-target';
import { Segmented, type SegmentOption } from '../choice';
import { draftCounts } from './file-row';
import { FileRows, type RowOptions, type Layout } from './file-rows';
import { useBySpecControl } from './group-by-spec-button';
import { SpecGroups } from './spec-groups';

const STORAGE_KEY = 'union.review.files';
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

/** How many files, the By spec switch and the List / Tree switch. */
function ListHeader({
  count,
  bySpec,
  layout,
  onLayout,
}: {
  count: number;
  bySpec: ReactElement | null;
  layout: Layout;
  onLayout: (layout: Layout) => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <span className="text-xs text-zinc-500">
        {count} file{count === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-1">
        {bySpec}
        <Segmented legend="File list layout" options={LAYOUTS} value={layout} onChange={onLayout} />
      </div>
    </div>
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
  const [layout, setLayout] = useLayout();
  // A slice's files are its own change: the grouping is the whole change's.
  const whole = allowBySpec && reviewSlice(target) === null;
  const bySpec = useBySpecControl({ target, whole });
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
      <ListHeader
        count={files.length}
        bySpec={bySpec.toggle}
        layout={layout}
        onLayout={setLayout}
      />
      {bySpec.status}
      {bySpec.groups ? (
        <SpecGroups
          files={shown}
          grouping={bySpec.groups}
          rows={rows}
          part={part}
          onPick={onSelect}
        />
      ) : (
        <FileRows files={shown} {...rows} />
      )}
      <IgnoredFiles files={ignored} rows={rows} />
    </div>
  );
}
