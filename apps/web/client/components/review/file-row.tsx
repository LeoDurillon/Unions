// One file: status, name (the full path in the flat list), its Key mark, drafts and line counts.
import type { ReactElement } from 'react';

import type { CommentView, DiffFileSummary } from '../../../src/api-types';
import { KeyBadge } from './report-marks';

const STATUS_MARK = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' } as const;
const STATUS_COLOR = {
  added: 'text-green-600',
  deleted: 'text-red-600',
  modified: 'text-amber-600',
  renamed: 'text-blue-600',
} as const;
/** Indentation of one tree level, and the left padding of the top level, in pixels. */
export const INDENT = 12;
export const PADDING = 8;

/** Draft comments per file path. */
export function draftCounts(comments: CommentView[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    if (comment.status === 'draft') {
      counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * A path whose file name always shows: the folders give way first, cut from the left
 * (`…/components/campaign/`), so files of one folder stay told apart.
 */
function FileLabel({ label }: { label: string }): ReactElement {
  const slash = label.lastIndexOf('/');
  if (slash === -1) {
    return <span className="min-w-0 flex-1 truncate font-mono">{label}</span>;
  }
  return (
    <span className="flex min-w-0 flex-1 font-mono">
      <span className="min-w-0 truncate text-zinc-500 [direction:rtl]">
        {/* Left-to-right inside, so the slashes stay where they are once cut from the left. */}
        <bdi>{label.slice(0, slash + 1)}</bdi>
      </span>
      <span className="max-w-full shrink-0 truncate">{label.slice(slash + 1)}</span>
    </span>
  );
}

/** One file: status, name (the full path in the flat list), its Key mark, drafts and line counts. */
export function FileRow({
  file,
  label,
  drafts,
  active,
  depth = 0,
  note,
  onSelect,
}: {
  file: DiffFileSummary;
  label: string;
  drafts: number;
  note?: string;
  active: boolean;
  depth?: number;
  onSelect: (id: number) => void;
}): ReactElement {
  return (
    <button
      type="button"
      title={file.path}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        onSelect(file.id);
      }}
      style={{ paddingLeft: PADDING + depth * INDENT }}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs transition ${active ? 'bg-indigo-100 dark:bg-indigo-950' : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800'}`}
    >
      <span className={`w-3 font-mono font-bold ${STATUS_COLOR[file.status]}`}>
        {STATUS_MARK[file.status]}
      </span>
      <FileLabel label={label} />
      <KeyBadge path={file.path} />
      {note ? <span className="shrink-0 text-[10px] text-zinc-500">{note}</span> : null}
      {drafts > 0 ? (
        <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">{drafts}</span>
      ) : null}
      <span className="text-green-600">+{file.additions}</span>
      <span className="text-red-600">−{file.deletions}</span>
    </button>
  );
}
