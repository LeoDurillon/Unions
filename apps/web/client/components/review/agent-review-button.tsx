// Asks the review agent for draft comments on the change, and shows where it stands.
import { useState, type ReactElement } from 'react';

import type { AgentReviewView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { isActive, useAgentReview } from '../../lib/use-agent-review';
import { Button, ErrorText } from '../ui';
import { AgentReviewDialog } from './agent-review-dialog';
import { GroupBySpecButton } from './group-by-spec-button';
import { ExplainToggle } from './view-toggle';

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
function AgentReviewButton({
  target,
  hasPullRequest,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
}): ReactElement {
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
        variant="ghost"
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
          hasPullRequest={hasPullRequest}
          last={latest ?? null}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The agent's helpers on the review page, in one quiet group: grouping the change by spec, reviewing
 * it, and the Explain panel.
 */
export function AgentButtons({
  target,
  hasPullRequest,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
}): ReactElement {
  return (
    <fieldset className="flex min-w-0 items-center gap-1 rounded-lg border border-zinc-200 py-0.5 pr-0.5 pl-2 dark:border-zinc-800">
      <legend className="sr-only">Agent</legend>
      <span aria-hidden className="text-xs font-medium text-zinc-500">
        Agent
      </span>
      <GroupBySpecButton target={target} hasPullRequest={hasPullRequest} />
      <AgentReviewButton target={target} hasPullRequest={hasPullRequest} />
      <ExplainToggle />
    </fieldset>
  );
}
