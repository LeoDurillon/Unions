// Links from the spec report to the diff: a file (its name, then its folder, shortened), its key lines as
// chips, opened in the Diff tab or with a comment started on them.
import type { ReportLines } from '@union/core';
import type { ReactElement } from 'react';

import { useExplain } from './explain-context';

/** Opens the Diff tab on a file, at some lines when given, with a draft comment when given. */
export type OpenLines = (path: string, lines?: ReportLines, draft?: string) => void;

/** One file's cited lines, in the order the report gave them. */
type FileLines = { path: string; lines: ReportLines[] };

/** Folders kept before the name; the ones above become "…". */
const SHOWN_FOLDERS = 2;

/** `openDiff` switches to the Diff tab; the file opens there through the review's focus. */
export function useOpenLines(openDiff: () => void): OpenLines {
  const explain = useExplain();
  return (path, lines, draft) => {
    const { start, end } = lines ?? { start: 1, end: 1 };
    explain?.show({ path, side: 'new', start, end, draft });
    openDiff();
  };
}

/** Groups citations by file, keeping the order of each file's first one. */
export function byFile(cites: (ReportLines & { path: string })[]): FileLines[] {
  const files = new Map<string, ReportLines[]>();
  for (const { path, start, end } of cites) {
    files.set(path, [...(files.get(path) ?? []), { start, end }]);
  }
  return [...files].map(([path, lines]) => ({ path, lines }));
}

function folder(path: string): string {
  const folders = path.split('/').slice(0, -1);
  const shown = folders.slice(-SHOWN_FOLDERS).join('/');
  return folders.length > SHOWN_FOLDERS ? `…/${shown}` : shown;
}

/** The file's name, then its folder in grey; the whole path on hover. */
export function FileName({ path }: { path: string }): ReactElement {
  const dir = folder(path);
  return (
    <span title={path} className="inline-flex min-w-0 items-baseline gap-1.5 text-left">
      <span className="font-mono text-xs font-medium break-all">{path.split('/').at(-1)}</span>
      {dir === '' ? null : <span className="truncate text-xs text-zinc-500">{dir}</span>}
    </span>
  );
}

/** The file's name, a link to it in the diff. */
export function FileLink({ path, onOpen }: { path: string; onOpen: OpenLines }): ReactElement {
  return (
    <button
      type="button"
      className="min-w-0 text-indigo-700 hover:underline dark:text-indigo-300"
      onClick={() => {
        onOpen(path);
      }}
    >
      <FileName path={path} />
    </button>
  );
}

function linesLabel({ start, end }: ReportLines): string {
  return start === end ? `L${start}` : `L${start}–${end}`;
}

/** `L15–32`, a link to those lines in the diff. */
function LinesChip({
  path,
  lines,
  onOpen,
}: {
  path: string;
  lines: ReportLines;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <button
      type="button"
      title={`Open ${path} at ${linesLabel(lines)} in the diff`}
      className="rounded bg-indigo-50 px-1.5 font-mono text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
      onClick={() => {
        onOpen(path, lines);
      }}
    >
      {linesLabel(lines)}
    </button>
  );
}

/** A file link followed by its line chips, on one line when it fits. */
export function FileRef({ path, lines, onOpen }: FileLines & { onOpen: OpenLines }): ReactElement {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <FileLink path={path} onOpen={onOpen} />
      {lines.map((at) => (
        <LinesChip key={`${at.start}-${at.end}`} path={path} lines={at} onOpen={onOpen} />
      ))}
    </span>
  );
}
