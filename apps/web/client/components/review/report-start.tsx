// Starts a spec report: what it does, the specs it will read (the Specs bar's), and Start.

import type { ReactElement } from 'react';

import type { ReviewTarget } from '../../lib/review/review-target';
import { useReviewReport } from '../../lib/review/use-review-report';
import { useReviewSpecs } from '../../lib/review/use-review-specs';
import { Button, ErrorText } from '../ui/ui';
import { SpecSummary } from './spec-summary';

export function ReportStart({
  target,
  again,
  onCancel,
}: {
  target: ReviewTarget;
  /** A report exists: this writes a new one in its place. */
  again: boolean;
  onCancel?: () => void;
}): ReactElement {
  const specs = useReviewSpecs(target).active;
  const { start } = useReviewReport(target);
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-1">
        <h3 className="text-[15px] font-semibold">
          {again ? 'Write the report again' : 'Spec report'}
        </h3>
        <p className="text-sm text-zinc-500">
          An agent compares the change with these specs and reports the files to read first, each
          requirement done, partial, missing or done differently, what the specs did not ask for,
          the risks and the questions to ask. It runs once, when you start it, on your Claude usage.
        </p>
      </div>
      <SpecSummary
        specs={specs}
        onEdit={() => {
          onCancel?.();
        }}
      />
      <ErrorText error={start.error} />
      <div className="flex justify-end gap-2">
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
        <Button
          variant="primary"
          disabled={!specs || specs.length === 0 || start.isPending}
          onClick={() => {
            start.mutate(undefined, { onSuccess: onCancel });
          }}
        >
          Write the report
        </Button>
      </div>
    </section>
  );
}
