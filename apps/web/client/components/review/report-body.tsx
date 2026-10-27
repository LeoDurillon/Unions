// A finished spec report: the verdict and summary, the counts, whether the change moved since, then the
// files to read first, the requirements and the other sections.
import { reportCounts, reportMarkdown, VERDICT_LABELS } from '@union/core/review-report-markdown';
import { useState, type ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review-reports';
import type { Tone } from '../../lib/labels';
import { Badge, Button } from '../ui';
import { ReportImportantFiles } from './report-important-files';
import type { OpenLines } from './report-open';
import { ReportRequirementCard } from './report-requirement';
import { ReportSections } from './report-sections';

const VERDICT_TONES: Record<NonNullable<ReportView['result']>['verdict'], Tone> = {
  matches: 'green',
  partial: 'amber',
  diverges: 'red',
};
const COPIED_MS = 2000;

/** What the host dropped from the agent's answer, said once when there is any. */
function droppedNote(dropped: number): string {
  if (dropped === 0) {
    return '';
  }
  return dropped === 1
    ? ' · 1 citation dropped: it could not be checked'
    : ` · ${dropped} citations dropped: they could not be checked`;
}

function CopyMarkdown({ report }: { report: ReportView }): ReactElement | null {
  const [copied, setCopied] = useState(false);
  const { result } = report;
  if (!result) {
    return null;
  }
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(reportMarkdown(result, report.specs));
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
  };
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void copy();
      }}
    >
      {copied ? 'Copied' : 'Copy as markdown'}
    </Button>
  );
}

function Outdated({ onAgain }: { onAgain: () => void }): ReactElement {
  return (
    <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="flex-1">Outdated: the change moved since this report was written.</span>
      <Button onClick={onAgain}>Run again</Button>
    </p>
  );
}

export function ReportBody({
  report,
  onOpen,
  onAgain,
}: {
  report: ReportView;
  onOpen: OpenLines;
  onAgain: () => void;
}): ReactElement | null {
  const { result } = report;
  if (!result) {
    return null;
  }
  return (
    <div className="space-y-6">
      {report.outdated ? <Outdated onAgain={onAgain} /> : null}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={VERDICT_TONES[result.verdict]}>{VERDICT_LABELS[result.verdict]}</Badge>
          <span className="flex-1 text-sm text-zinc-500">{reportCounts(result)}</span>
          <CopyMarkdown report={report} />
          {report.outdated ? null : <Button onClick={onAgain}>Run again</Button>}
        </div>
        {result.summary === '' ? null : <p className="text-sm">{result.summary}</p>}
        <p className="text-xs text-zinc-500">
          Specs read: {report.specs.map((spec) => spec.label).join(', ')}
          {droppedNote(result.dropped)}
        </p>
      </header>
      <ReportImportantFiles files={result.importantFiles} onOpen={onOpen} />
      {result.requirements.length > 0 ? (
        <section id="report-requirements" className="space-y-2">
          <h3 className="font-semibold">Requirements</h3>
          {result.requirements.map((requirement) => (
            <ReportRequirementCard
              key={requirement.key}
              requirement={requirement}
              specs={report.specs}
              onOpen={onOpen}
            />
          ))}
        </section>
      ) : null}
      <ReportSections result={result} onOpen={onOpen} />
    </div>
  );
}
