// The spec report's sections: the frame they share (a title with a count, rows in one box), then the last
// ones: what the specs did not ask for, the risks, the questions and the docs to update.
import type { ReviewReportResult } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { FileLink, FileName, type OpenLines } from './report-open';

const LEVEL_TONES: Record<ReviewReportResult['risks'][number]['severity'], Tone> = {
  low: 'neutral',
  medium: 'amber',
  high: 'red',
};

/** The rows of a section: one box, a line between rows. */
export const ROWS_CLASS =
  'divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900';

/** A titled part of the report, left out when it has nothing; `collapsed`: closed until clicked. */
export function ReportSection({
  id,
  title,
  count,
  collapsed = false,
  children,
}: {
  id: string;
  title: string;
  count: number;
  collapsed?: boolean;
  children: ReactNode;
}): ReactElement | null {
  if (count === 0) {
    return null;
  }
  const heading = (
    <>
      {title}
      <span className="text-sm font-normal text-zinc-400">{count}</span>
    </>
  );
  if (collapsed) {
    return (
      <details id={id} className="space-y-2">
        <summary className="cursor-pointer font-semibold select-none">
          <h3 className="inline-flex items-baseline gap-2">{heading}</h3>
        </summary>
        {children}
      </details>
    );
  }
  return (
    <section id={id} className="space-y-2">
      <h3 className="flex items-baseline gap-2 font-semibold">{heading}</h3>
      {children}
    </section>
  );
}

function OutOfScope({
  changes,
  onOpen,
}: {
  changes: ReviewReportResult['outOfScope'];
  onOpen: OpenLines;
}): ReactElement {
  return (
    <ul className={ROWS_CLASS}>
      {changes.map((change) => (
        <li key={`${change.path}:${change.hunks.join(',')}`} className="space-y-1 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1">
              <FileLink path={change.path} onOpen={onOpen} />
            </span>
            <Badge tone={LEVEL_TONES[change.risk]}>{change.risk} risk</Badge>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400">{change.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function Risks({
  risks,
  onOpen,
}: {
  risks: ReviewReportResult['risks'];
  onOpen: OpenLines;
}): ReactElement {
  return (
    <ul className={ROWS_CLASS}>
      {risks.map((risk) => (
        <li key={risk.title} className="space-y-1 px-3 py-2">
          <p className="flex items-center gap-2">
            <Badge tone={LEVEL_TONES[risk.severity]}>{risk.severity}</Badge>
            <span className="font-medium">{risk.title}</span>
          </p>
          {risk.detail === '' ? null : (
            <p className="text-zinc-600 dark:text-zinc-400">{risk.detail}</p>
          )}
          {risk.paths.length > 0 ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {risk.paths.map((path) => (
                <FileLink key={path} path={path} onOpen={onOpen} />
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ReportSections({
  result,
  onOpen,
}: {
  result: ReviewReportResult;
  onOpen: OpenLines;
}): ReactElement {
  return (
    <>
      <ReportSection
        id="report-out-of-scope"
        title="Not in the spec"
        count={result.outOfScope.length}
      >
        <OutOfScope changes={result.outOfScope} onOpen={onOpen} />
      </ReportSection>
      <ReportSection id="report-risks" title="Risks" count={result.risks.length}>
        <Risks risks={result.risks} onOpen={onOpen} />
      </ReportSection>
      <ReportSection id="report-questions" title="Questions" count={result.questions.length}>
        <ol className={`${ROWS_CLASS} list-inside list-decimal`}>
          {result.questions.map((question) => (
            <li key={question} className="px-3 py-2">
              {question}
            </li>
          ))}
        </ol>
      </ReportSection>
      <ReportSection id="report-docs" title="Docs to update" count={result.docs.length}>
        <ul className={ROWS_CLASS}>
          {result.docs.map((doc) => (
            <li key={doc.path} className="space-y-1 px-3 py-2">
              <FileName path={doc.path} />
              <p className="text-zinc-600 dark:text-zinc-400">{doc.note}</p>
            </li>
          ))}
        </ul>
      </ReportSection>
    </>
  );
}
