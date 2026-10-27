// Links from the spec report to the diff: a file at some lines, opened in the Diff tab, or a comment
// started on them.
import type { ReportLines } from '@union/core';
import type { ReactElement } from 'react';

import { useExplain } from './explain-context';

/** Opens the Diff tab on a file, at some lines when given, with a draft comment when given. */
export type OpenLines = (path: string, lines?: ReportLines, draft?: string) => void;

/** `openDiff` switches to the Diff tab; the file opens there through the review's focus. */
export function useOpenLines(openDiff: () => void): OpenLines {
  const explain = useExplain();
  return (path, lines, draft) => {
    const { start, end } = lines ?? { start: 1, end: 1 };
    explain?.show({ path, side: 'new', start, end, draft });
    openDiff();
  };
}

function place(path: string, lines?: ReportLines): string {
  if (!lines) {
    return path;
  }
  return lines.start === lines.end
    ? `${path}:${lines.start}`
    : `${path}:${lines.start}-${lines.end}`;
}

/** `path:start-end`, a link to those lines in the diff. */
export function CodeLink({
  path,
  lines,
  onOpen,
}: {
  path: string;
  lines?: ReportLines;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <button
      type="button"
      title="Open in the diff"
      className="font-mono text-xs text-indigo-700 hover:underline dark:text-indigo-300"
      onClick={() => {
        onOpen(path, lines);
      }}
    >
      {place(path, lines)}
    </button>
  );
}
