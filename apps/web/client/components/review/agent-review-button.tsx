// Asks the review agent for draft comments on the change, and shows where it stands.

import type { AgentReviewCoverage } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { AgentReviewView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import { isActive, useAgentReview } from '../../lib/review/use-agent-review';
import { Button, ErrorText } from '../ui/ui';
import { AgentReviewDialog } from './agent-review-dialog';

/** Paths named in the coverage's tooltip; the rest are counted. */
const LISTED = 30;

/** How much of the change the last run opened, from its log; nothing when it was not measured. */
function Coverage({ coverage }: { coverage: AgentReviewCoverage | null }): ReactElement | null {
  if (!coverage || coverage.files === 0) {
    return null;
  }
  const { unopened } = coverage;
  if (unopened.length === 0) {
    return <span className="text-xs text-zinc-500">· opened every file</span>;
  }
  const lines = unopened.reduce((sum, file) => sum + file.lines, 0);
  const listed = unopened.slice(0, LISTED).map((file) => `${file.path} (${file.lines} lines)`);
  const more = unopened.length > LISTED ? [`and ${unopened.length - LISTED} more`] : [];
  return (
    <span
      title={['Never opened by the agent:', ...listed, ...more].join('\n')}
      className="cursor-help text-xs text-amber-700 dark:text-amber-400"
    >
      · did not open {unopened.length} of {coverage.files} files ({lines} of {coverage.lines} lines)
    </span>
  );
}

/** What the last run left: its error, or how many suggestions it added. */
function LastRun({ review }: { review: AgentReviewView | null | undefined }): ReactElement | null {
  if (review?.status === 'failed') {
    return (
      <span
        title={review.error ?? undefined}
        className="max-w-48 truncate text-xs text-red-600 dark:text-red-400"
      >
        Agent review failed: {review.error}
      </span>
    );
  }
  if (review?.status === 'succeeded') {
    const count = review.comments ?? 0;
    return (
      <>
        <span className="text-xs text-zinc-500">
          {count === 0 ? 'No suggestion' : `${count} suggestion${count === 1 ? '' : 's'}`}
        </span>
        <Coverage coverage={review.coverage} />
      </>
    );
  }
  return null;
}

/** Asks the review agent for draft comments on the change, and shows where it stands. */
export function AgentReviewButton({ target }: { target: ReviewTarget }): ReactElement {
  const { review, cancel } = useAgentReview(target);
  const [open, setOpen] = useState(false);
  const latest = review.data;
  if (isActive(latest)) {
    return (
      <div className="flex items-center gap-2">
        <span className="animate-pulse text-xs text-indigo-600 dark:text-indigo-400">
          {latest?.status === 'queued' ? 'Agent review queued…' : 'Agent reviewing…'}
          {latest?.stack ? ` (the stack of ${latest.stack.length})` : ''}
        </span>
        <Button
          disabled={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel
        </Button>
        <ErrorText error={cancel.error} />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <LastRun review={latest} />
      <Button
        title="The agent checks the change against the specs you give; its comments arrive as drafts."
        onClick={() => {
          setOpen(true);
        }}
      >
        {latest?.status === 'succeeded' ? 'Review again with agent' : 'Review with agent'}
      </Button>
      {open ? (
        <AgentReviewDialog
          target={target}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
