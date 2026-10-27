// The lines of the open file that what needs the reviewer points at, for the diff's gutter to mark:
// provided by the file's diff, read by each line number.
import type { ReportLines } from '@union/core';
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

/** An item of what needs the reviewer, on the open file: its number, title and lines. */
export type FileItem = { number: number; title: string; lines: ReportLines[] };

/** What marks a line: the numbers and titles of its items; `first`: a cited range starts here. */
export type LineMark = { numbers: number[]; titles: string[]; first: boolean };

type MarkAt = (line: number) => LineMark | null;

const LineMarksContext = createContext<MarkAt>(() => null);

function markAt(items: FileItem[], line: number): LineMark | null {
  const here = items.filter((item) => item.lines.some((r) => r.start <= line && line <= r.end));
  if (here.length === 0) {
    return null;
  }
  return {
    numbers: here.map((item) => item.number),
    titles: here.map((item) => `${item.number}. ${item.title}`),
    first: here.some((item) => item.lines.some((r) => r.start === line)),
  };
}

export function LineMarksProvider({
  items,
  children,
}: {
  items: FileItem[];
  children: ReactNode;
}): ReactElement {
  const value = useMemo<MarkAt>(() => (line) => markAt(items, line), [items]);
  return <LineMarksContext.Provider value={value}>{children}</LineMarksContext.Provider>;
}

/** The mark of a line of the new side; null for none, or outside a marked file. */
export function useLineMark(line: number | null): LineMark | null {
  const at = useContext(LineMarksContext);
  return line === null ? null : at(line);
}
