// The review's Report tab: the newest spec report, the agent writing one (with Cancel), or why the
// last one failed. Otherwise, what a report is and Start.

import { useState, type ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review/review-reports';
import type { ReviewTarget } from '../../lib/review/review-target';
import { isReporting, useReviewReport } from '../../lib/review/use-review-report';
import { Button, ErrorText } from '../ui/ui';
import { ReportBody } from './report-body';
import { useOpenLines } from './report-open';
import { ReportStart } from './report-start';

function Writing({ target, report }: { target: ReviewTarget; report: ReportView }): ReactElement {
  const { cancel } = useReviewReport(target);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <span aria-hidden className="size-2 animate-pulse rounded-full bg-indigo-500" />
      <span className="flex-1 text-indigo-600 dark:text-indigo-400">
        {report.status === 'queued' ? 'Waiting for a run slot…' : 'Writing the report…'}
      </span>
      <ErrorText error={cancel.error} />
      <Button
        disabled={cancel.isPending}
        onClick={() => {
          cancel.mutate();
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

function Failed({ report }: { report: ReportView }): ReactElement | null {
  if (report.status !== 'failed') {
    return null;
  }
  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
      <h3 className="text-[15px] font-semibold">The last report failed</h3>
      <p className="whitespace-pre-wrap text-red-800 dark:text-red-300">{report.error}</p>
      {report.raw === null ? null : (
        <details className="rounded-md border border-red-200 bg-white p-2 dark:border-red-900 dark:bg-zinc-900">
          <summary className="cursor-pointer text-zinc-500">The agent&rsquo;s answer</summary>
          <p className="mt-2 whitespace-pre-wrap">{report.raw}</p>
        </details>
      )}
    </div>
  );
}

/** `openDiff` switches to the Diff tab, where the report's links open their file. */
export function ReportTab({
  target,
  openDiff,
}: {
  target: ReviewTarget;
  openDiff: () => void;
}): ReactElement {
  const { report } = useReviewReport(target);
  const [again, setAgain] = useState(false);
  const onOpen = useOpenLines(openDiff);
  const latest = report.data;
  if (report.isPending) {
    return <p className="text-sm text-zinc-500">Loading the report…</p>;
  }
  if (report.error) {
    return <ErrorText error={report.error} />;
  }
  if (latest && isReporting(latest)) {
    return <Writing target={target} report={latest} />;
  }
  if (!latest?.result || again) {
    return (
      <div className="space-y-4">
        {latest ? <Failed report={latest} /> : null}
        <ReportStart
          target={target}
          again={latest !== null}
          onCancel={
            again
              ? () => {
                  setAgain(false);
                }
              : undefined
          }
        />
      </div>
    );
  }
  return (
    <ReportBody
      target={target}
      report={latest}
      onOpen={onOpen}
      onAgain={() => {
        setAgain(true);
      }}
    />
  );
}
