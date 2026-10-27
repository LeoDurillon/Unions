// The report's important files: the ones to read first, in order, each with why and its key lines.
import type { ImportantFile } from '@union/core';
import type { ReactElement } from 'react';

import { CodeLink, type OpenLines } from './report-open';

const KIND_LABELS: Record<ImportantFile['kind'], string> = {
  core: 'Core',
  risky: 'Risky',
  entry: 'Entry point',
  migration: 'Migration',
  api: 'API',
  test: 'Test',
};

function FileItem({ file, onOpen }: { file: ImportantFile; onOpen: OpenLines }): ReactElement {
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {file.unchanged ? (
          <span className="font-mono text-xs">{file.path}</span>
        ) : (
          <CodeLink path={file.path} onOpen={onOpen} />
        )}
        <span className="text-xs text-zinc-500">
          {KIND_LABELS[file.kind]}
          {file.unchanged ? ' · not changed' : ''}
        </span>
      </div>
      {file.why === '' ? null : <p className="text-sm">{file.why}</p>}
      {file.lines.length > 0 && !file.unchanged ? (
        <p className="flex flex-wrap gap-2">
          {file.lines.map((lines) => (
            <CodeLink key={lines.start} path={file.path} lines={lines} onOpen={onOpen} />
          ))}
        </p>
      ) : null}
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
  if (files.length === 0) {
    return null;
  }
  return (
    <section id="report-important-files" className="space-y-2">
      <h3 className="font-semibold">Read first</h3>
      <ol className="list-decimal space-y-3 pl-5">
        {files.map((file) => (
          <FileItem key={file.path} file={file} onOpen={onOpen} />
        ))}
      </ol>
    </section>
  );
}
