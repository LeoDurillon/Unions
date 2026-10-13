import { useState, type ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';
import { draftCounts, FileRow } from './file-row';
import { FileTree } from './file-tree';

type Layout = 'list' | 'tree';

const STORAGE_KEY = 'union.review.files';
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

type Props = {
  files: DiffFileSummary[];
  drafts: Map<string, number>;
  selected: number | null;
  onSelect: (id: number) => void;
};

function FileRows({
  files,
  drafts,
  selected,
  onSelect,
  layout,
}: Props & { layout: Layout }): ReactElement {
  if (layout === 'tree') {
    return <FileTree files={files} drafts={drafts} selected={selected} onSelect={onSelect} />;
  }
  return (
    <ul className="space-y-0.5">
      {files.map((file) => (
        <li key={file.id}>
          <FileRow
            file={file}
            label={file.path}
            drafts={drafts.get(file.path) ?? 0}
            active={file.id === selected}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

/** The touched files, as a list or a tree; ignored ones (lock files, project patterns) are listed apart, collapsed. */
export function FileList({
  files,
  comments,
  selected,
  onSelect,
}: {
  files: DiffFileSummary[];
  comments: CommentView[];
  selected: number | null;
  onSelect: (id: number) => void;
}): ReactElement {
  const [layout, setLayout] = useLayout();
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
        <LayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <FileRows files={shown} {...rows} />
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
