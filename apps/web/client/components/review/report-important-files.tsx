// The report's files to read first, in order, each with why and its key lines; and the ones to skim,
// closed until clicked.
import type { ImportantFile, ReviewReportResult } from '@union/core';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { FileLink, FileName, FileRef, type OpenLines } from './report-open';
import { ReportSection, ROWS_CLASS } from './report-sections';

const KINDS: Record<ImportantFile['kind'], { label: string; tone: Tone }> = {
  core: { label: 'Core', tone: 'blue' },
  risky: { label: 'Risky', tone: 'amber' },
  entry: { label: 'Entry point', tone: 'neutral' },
  migration: { label: 'Migration', tone: 'red' },
  api: { label: 'API', tone: 'blue' },
  test: { label: 'Test', tone: 'green' },
};

function FileItem({
  file,
  position,
  onOpen,
}: {
  file: ImportantFile;
  position: number;
  onOpen: OpenLines;
}): ReactElement {
  const kind = KINDS[file.kind];
  return (
    <li className="flex gap-3 px-3 py-2">
      <span className="w-4 shrink-0 text-right text-zinc-400 tabular-nums">{position}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1">
            {file.unchanged ? (
              <FileName path={file.path} />
            ) : (
              <FileRef path={file.path} lines={file.lines} onOpen={onOpen} />
            )}
          </span>
          {file.unchanged ? <span className="text-xs text-zinc-500">not changed</span> : null}
          <Badge tone={kind.tone}>{kind.label}</Badge>
        </div>
        {file.why === '' ? null : <p className="text-zinc-600 dark:text-zinc-400">{file.why}</p>}
      </div>
    </li>
  );
}

export function ReportImportantFiles({
  files,
  onOpen,
}: {
  files: ImportantFile[];
  onOpen: OpenLines;
}): ReactElement | null {
  return (
    <ReportSection id="report-important-files" title="Read first" count={files.length}>
      <ol className={ROWS_CLASS}>
        {files.map((file, at) => (
          <FileItem key={file.path} file={file} position={at + 1} onOpen={onOpen} />
        ))}
      </ol>
    </ReportSection>
  );
}

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
