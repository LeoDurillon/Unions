import type { ReactElement } from 'react';

import type { AgentReviewView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { isActive, useAgentReview } from '../../lib/use-agent-review';
import { Button, ErrorText } from '../ui';

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
      <span className="text-xs text-zinc-500">
        {count === 0 ? 'No suggestion' : `${count} suggestion${count === 1 ? '' : 's'}`}
      </span>
    );
  }
  return null;
}

/** Asks the review agent for draft comments on the change, and shows where it stands. */
export function AgentReviewButton({ target }: { target: ReviewTarget }): ReactElement {
  const { review, start, cancel } = useAgentReview(target);
  const latest = review.data;
  if (isActive(latest)) {
    return (
      <div className="flex items-center gap-2">
        <span className="animate-pulse text-xs text-indigo-600 dark:text-indigo-400">
          {latest?.status === 'queued' ? 'Agent review queued…' : 'Agent reviewing…'}
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
      <ErrorText error={start.error} />
      <Button
        disabled={start.isPending}
        title="The agent's comments arrive as drafts: nothing is sent until you send the review."
        onClick={() => {
          start.mutate();
        }}
      >
        {latest?.status === 'succeeded' ? 'Review again with agent' : 'Review with agent'}
      </Button>
    </div>
  );
}
