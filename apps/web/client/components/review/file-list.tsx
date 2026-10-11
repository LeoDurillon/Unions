import type { ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';

const STATUS_MARK = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' } as const;
const STATUS_COLOR = {
  added: 'text-green-600',
  deleted: 'text-red-600',
  modified: 'text-amber-600',
  renamed: 'text-blue-600',
} as const;

function FileRows({
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
  return (
    <ul className="space-y-0.5">
      {files.map((file) => {
        const drafts = comments.filter(
          (comment) => comment.path === file.path && comment.status === 'draft',
        ).length;
        const active = file.id === selected;
        return (
          <li key={file.id}>
            <button
              type="button"
              title={file.path}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onSelect(file.id);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${active ? 'bg-indigo-100 dark:bg-indigo-950' : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800'}`}
            >
              <span className={`w-3 font-mono font-bold ${STATUS_COLOR[file.status]}`}>
                {STATUS_MARK[file.status]}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
              {drafts > 0 ? (
                <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
                  {drafts}
                </span>
              ) : null}
              <span className="text-green-600">+{file.additions}</span>
              <span className="text-red-600">−{file.deletions}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The touched files; ignored ones (lock files, project patterns) are listed apart, collapsed. */
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
  const shown = files.filter((file) => !file.ignored);
  const ignored = files.filter((file) => file.ignored);
  const openIgnored = ignored.some((file) => file.id === selected);
  return (
    <div className="space-y-3">
      <FileRows files={shown} comments={comments} selected={selected} onSelect={onSelect} />
      {ignored.length > 0 ? (
        <details open={openIgnored} className="text-xs text-zinc-500">
          <summary className="cursor-pointer px-2">
            {ignored.length} ignored file{ignored.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-1 opacity-70">
            <FileRows files={ignored} comments={comments} selected={selected} onSelect={onSelect} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
