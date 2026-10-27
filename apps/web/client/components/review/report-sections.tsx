// The spec report's last sections: what the specs did not ask for, the risks, the questions and the
// docs to update.
import type { ReviewReportResult } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import type { Tone } from '../../lib/labels';
import { Badge } from '../ui';
import { CodeLink, type OpenLines } from './report-open';

const LEVEL_TONES: Record<ReviewReportResult['risks'][number]['severity'], Tone> = {
  low: 'neutral',
  medium: 'amber',
  high: 'red',
};

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}): ReactElement | null {
  if (count === 0) {
    return null;
  }
  return (
    <section id={id} className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-2 text-sm">{children}</ul>
    </section>
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
      <Section id="report-out-of-scope" title="Not in the spec" count={result.outOfScope.length}>
        {result.outOfScope.map((change) => (
          <li key={`${change.path}:${change.hunks.join(',')}`} className="flex flex-wrap gap-2">
            <CodeLink path={change.path} onOpen={onOpen} />
            <Badge tone={LEVEL_TONES[change.risk]}>{change.risk} risk</Badge>
            <span>{change.reason}</span>
          </li>
        ))}
      </Section>
      <Section id="report-risks" title="Risks" count={result.risks.length}>
        {result.risks.map((risk) => (
          <li key={risk.title} className="space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={LEVEL_TONES[risk.severity]}>{risk.severity}</Badge>
              <span className="font-medium">{risk.title}</span>
              {risk.paths.map((path) => (
                <CodeLink key={path} path={path} onOpen={onOpen} />
              ))}
            </p>
            {risk.detail === '' ? null : <p>{risk.detail}</p>}
          </li>
        ))}
      </Section>
      <Section id="report-questions" title="Questions" count={result.questions.length}>
        {result.questions.map((question) => (
          <li key={question} className="list-inside list-disc">
            {question}
          </li>
        ))}
      </Section>
      <Section id="report-docs" title="Docs to update" count={result.docs.length}>
        {result.docs.map((doc) => (
          <li key={doc.path}>
            <span className="font-mono text-xs">{doc.path}</span>: {doc.note}
          </li>
        ))}
      </Section>
    </>
  );
}
