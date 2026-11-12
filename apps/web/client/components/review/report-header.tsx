// The top of a finished spec report: the verdict, the counts, its actions, the summary, and the
// specs it read. The actions add the gaps to the review, copy it, run it again; it also says
// whether the change moved since.

import {
  reportCounts,
  reportGaps,
  reportMarkdown,
  VERDICT_LABELS,
} from '@union/core/review-report-markdown';
import type { ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review/review-reports';
import type { Tone } from '../../lib/board/labels';
import type { ReviewTarget } from '../../lib/review/review-target';
import { useReviewReport } from '../../lib/review/use-review-report';
import { Badge, Button, ErrorText } from '../ui/ui';
import { CopyMarkdownButton } from './copy-markdown-button';

const VERDICT_TONES: Record<NonNullable<ReportView['result']>['verdict'], Tone> = {
  matches: 'green',
  partial: 'amber',
  diverges: 'red',
};

/** What the host dropped from the agent's answer, said once when there is any. */
function droppedNote(dropped: number): string {
  if (dropped === 0) {
    return '';
  }
  return dropped === 1
    ? ' · 1 citation dropped: it could not be checked'
    : ` · ${dropped} citations dropped: they could not be checked`;
}

/** "Ticket, Notion: X (same as Ticket, not sent again)". */
function specsRead(specs: ReportView['specs']): string {
  return specs
    .map((spec) => {
      const host = specs.find((other) => other.id === spec.sameAs);
      return host ? `${spec.label} (same as ${host.label}, not sent again)` : spec.label;
    })
    .join(', ');
}

/** One draft on the whole change asking for what is missing, partial or done differently. */
function AddGaps({
  target,
  report,
}: {
  target: ReviewTarget;
  report: ReportView;
}): ReactElement | null {
  const { addGaps } = useReviewReport(target);
  if (!report.result || report.outdated || reportGaps(report.result, report.specs) === null) {
    return null;
  }
  return (
    <>
      <ErrorText error={addGaps.error} />
      <Button
        title="A draft comment listing the requirements not met: edit it, then send it with your review"
        disabled={addGaps.isPending || addGaps.isSuccess}
        onClick={() => {
          addGaps.mutate();
        }}
      >
        {addGaps.isSuccess ? 'Added to the review (a draft)' : 'Add the gaps to the review'}
      </Button>
    </>
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

export function ReportHeader({
  target,
  report,
  onAgain,
}: {
  target: ReviewTarget;
  report: ReportView;
  onAgain: () => void;
}): ReactElement | null {
  const { result } = report;
  if (!result) {
    return null;
  }
  return (
    <>
      {report.outdated ? <Outdated onAgain={onAgain} /> : null}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={VERDICT_TONES[result.verdict]}>{VERDICT_LABELS[result.verdict]}</Badge>
          <span className="text-sm text-zinc-500">{reportCounts(result)}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <AddGaps target={target} report={report} />
            <CopyMarkdownButton text={() => reportMarkdown(result, report.specs)} />
            {report.outdated ? null : <Button onClick={onAgain}>Run again</Button>}
          </span>
        </div>
        {result.summary === '' ? null : (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm leading-relaxed dark:bg-zinc-900">
            {result.summary}
          </p>
        )}
        <p className="text-xs text-zinc-500">
          Specs read: {specsRead(report.specs)}
          {droppedNote(result.dropped)}
        </p>
      </header>
    </>
  );
}
