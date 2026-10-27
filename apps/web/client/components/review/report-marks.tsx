// The important files of the review's current spec report, for the file list to mark: provided once
// by the list, read by each row.
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import type { ReviewTarget } from '../../lib/review-target';
import { useReviewReport } from '../../lib/use-review-report';

/** A file to read first: its place in the reading order (from 1) and why. */
type ImportantMark = { position: number; why: string };

const MarksContext = createContext<ReadonlyMap<string, ImportantMark>>(new Map());

/** Marks the files of the newest report while it is current (finished, the change not moved since). */
export function ImportantFilesProvider({
  target,
  children,
}: {
  target: ReviewTarget;
  children: ReactNode;
}): ReactElement {
  const report = useReviewReport(target).report.data;
  const marks = useMemo(() => {
    const files = report?.result && !report.outdated ? report.result.importantFiles : [];
    return new Map(files.map((file, at) => [file.path, { position: at + 1, why: file.why }]));
  }, [report]);
  return <MarksContext.Provider value={marks}>{children}</MarksContext.Provider>;
}

function useImportantMark(path: string): ImportantMark | null {
  return useContext(MarksContext).get(path) ?? null;
}

/** "Key 1": the file's place among the ones to read first, its reason on hover. */
export function KeyBadge({ path }: { path: string }): ReactElement | null {
  const mark = useImportantMark(path);
  if (!mark) {
    return null;
  }
  return (
    <span
      title={`Read first (${mark.position}): ${mark.why}`}
      className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      Key {mark.position}
    </span>
  );
}
