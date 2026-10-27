// The review's Report tab: the newest spec report, the agent writing one (with Cancel), why the last
// one failed, or what a report is and Start.
import { useState, type ReactElement } from 'react';

import type { ReportView } from '../../../src/routes/review-reports';
import type { ReviewTarget } from '../../lib/review-target';
import { isReporting, useReviewReport } from '../../lib/use-review-report';
import { Button, ErrorText } from '../ui';
import { ReportBody } from './report-body';
import { useOpenLines } from './report-open';
import { ReportStart } from './report-start';

function Writing({ target, report }: { target: ReviewTarget; report: ReportView }): ReactElement {
  const { cancel } = useReviewReport(target);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className="flex-1 animate-pulse text-indigo-600 dark:text-indigo-400">
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
    <div className="space-y-2 text-sm">
      <p className="text-red-600 dark:text-red-400">The last report failed: {report.error}</p>
      {report.raw === null ? null : (
        <details className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
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
