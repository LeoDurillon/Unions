// The changed files the spec report says the reviewer can skim, and the ones it said nothing about;
// both closed until clicked.
import type { ReviewReportResult } from '@union/core';
import type { ReactElement } from 'react';

import { FileLink, type OpenLines } from './report-open';
import { ReportSection, ROWS_CLASS } from './report-sections';

export function ReportSkim({
  result,
  onOpen,
}: {
  result: ReviewReportResult;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <ReportSection id="report-skim" title="Skim" count={result.skim.length} collapsed>
      <ul className={ROWS_CLASS}>
        {result.skim.map((file) => (
          <li key={file.path} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
            <FileLink path={file.path} onOpen={onOpen} />
            <span className="text-zinc-600 dark:text-zinc-400">{file.why}</span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}

export function ReportUnreviewed({
  result,
  onOpen,
}: {
  result: ReviewReportResult;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <ReportSection
      id="report-unreviewed"
      title="Not looked at by the agent"
      count={result.unreviewed.length}
      collapsed
    >
      <ul className={ROWS_CLASS}>
        {result.unreviewed.map((path) => (
          <li key={path} className="flex px-3 py-2">
            <FileLink path={path} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
