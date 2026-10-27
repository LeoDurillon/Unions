// A file's diff with what the review's current spec report says about it: a note above (read first,
// skim, what needs the reviewer here) and marks on the lines an item points at.
import type { ReviewReportResult } from '@union/core';
import { useMemo, type ComponentProps, type ReactElement } from 'react';

import type { ReviewTarget } from '../../lib/review-target';
import { useReviewReport } from '../../lib/use-review-report';
import { FileDiff } from './file-diff';
import { LineMarksProvider, type FileItem } from './report-line-marks';

export type { DiffView } from './file-diff';

/** What the report says about the file: read first (its place and why), skim (why), its items. */
type FileNotes = {
  read: { position: number; why: string } | null;
  skim: string | null;
  items: FileItem[];
};

const NONE: FileNotes = { read: null, skim: null, items: [] };

function notesOf(result: ReviewReportResult, path: string): FileNotes {
  const read = result.importantFiles.findIndex((file) => file.path === path);
  return {
    read: read === -1 ? null : { position: read + 1, why: result.importantFiles[read]?.why ?? '' },
    skim: result.skim.find((file) => file.path === path)?.why ?? null,
    items: result.attention.flatMap((item, at) => {
      const lines = item.cites.filter((cite) => cite.path === path);
      return item.notUseful || lines.length === 0
        ? []
        : [{ number: at + 1, title: item.title, lines }];
    }),
  };
}

function useFileNotes(target: ReviewTarget, path: string): FileNotes {
  const report = useReviewReport(target).report.data;
  return useMemo(() => {
    const current = report?.result && !report.outdated ? report.result : null;
    return current ? notesOf(current, path) : NONE;
  }, [report, path]);
}

function Note({ notes }: { notes: FileNotes }): ReactElement | null {
  if (!notes.read && notes.skim === null && notes.items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      {notes.read ? (
        <p>
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Read first ({notes.read.position})
          </span>{' '}
          {notes.read.why}
        </p>
      ) : null}
      {notes.skim === null ? null : (
        <p className="text-zinc-500">
          <span className="font-medium">Skim</span> {notes.skim}
        </p>
      )}
      {notes.items.map((item) => (
        <p key={item.number}>
          <span className="mr-1 rounded bg-red-100 px-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {item.number}
          </span>
          {item.title}
        </p>
      ))}
    </div>
  );
}

/** The file's diff, with the report's note above it and its items' lines marked. */
export function ReportFileDiff({
  target,
  ...props
}: ComponentProps<typeof FileDiff> & { target: ReviewTarget }): ReactElement {
  const notes = useFileNotes(target, props.path);
  return (
    <>
      <Note notes={notes} />
      <LineMarksProvider items={notes.items}>
        <FileDiff {...props} />
      </LineMarksProvider>
    </>
  );
}
