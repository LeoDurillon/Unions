// One pull request: state, title, who and when, branches, review, size, and what can be done with
// it.
import type { ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { Badge, Button } from '../ui';

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'neutral';

/** The size and the action sit in fixed columns, so the rows line up. */
const STATS = 'w-28 shrink-0 pt-0.5 text-right font-mono text-xs';
export const ACTION = 'flex w-36 shrink-0 justify-end';

function stateBadge(pull: PullRequestListItem): { label: string; tone: Tone } {
  if (pull.state === 'merged') {
    return { label: 'merged', tone: 'blue' };
  }
  if (pull.state === 'closed') {
    return { label: 'closed', tone: 'red' };
  }
  return pull.draft ? { label: 'draft', tone: 'neutral' } : { label: 'open', tone: 'green' };
}

const REVIEW_BADGES: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: 'approved', tone: 'green' },
  CHANGES_REQUESTED: { label: 'changes requested', tone: 'red' },
  REVIEW_REQUIRED: { label: 'review required', tone: 'amber' },
};

/** What a row offers: its ticket when linked, else adding it to the reviews (a quiet button). */
function RowAction({
  pull,
  inReview,
  onOpenTicket,
  onAddReview,
}: {
  pull: PullRequestListItem;
  inReview: boolean;
  onOpenTicket: (id: number) => void;
  onAddReview: () => void;
}): ReactElement {
  const { ticketId } = pull;
  if (ticketId !== null) {
    return (
      <Button
        onClick={() => {
          onOpenTicket(ticketId);
        }}
      >
        Open ticket
      </Button>
    );
  }
  if (inReview) {
    return <Badge tone="blue">in reviews</Badge>;
  }
  return (
    <Button variant="ghost" onClick={onAddReview}>
      Add to reviews
    </Button>
  );
}

/** One pull request: state, title, who and when, branches, review, size, and what can be done with it. */
export function PullRequestItem({
  pull,
  inReview,
  joins,
  onOpenTicket,
  onAddReview,
}: {
  pull: PullRequestListItem;
  inReview: boolean;
  /** The bottom pull request of the stack under review that adding this one would join. */
  joins: number | null;
  onOpenTicket: (id: number) => void;
  onAddReview: () => void;
}): ReactElement {
  const state = stateBadge(pull);
  const review =
    pull.state === 'open' && pull.reviewDecision ? REVIEW_BADGES[pull.reviewDecision] : undefined;
  return (
    <li className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <Badge tone={state.tone}>{state.label}</Badge>
      <div className="min-w-0 flex-1 space-y-1">
        <a
          href={pull.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
        >
          {pull.title}
        </a>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          <span>
            #{pull.number} by @{pull.author} · updated {new Date(pull.updatedAt).toLocaleString()}
          </span>
          <span className="truncate font-mono">
            {pull.headBranch} → {pull.baseBranch}
          </span>
          {review ? <Badge tone={review.tone}>{review.label}</Badge> : null}
          {joins === null ? null : <span>joins the stack of #{joins} in reviews</span>}
        </p>
      </div>
      <span className={STATS}>
        <span className="text-green-700 dark:text-green-400">+{pull.additions}</span>{' '}
        <span className="text-red-700 dark:text-red-400">−{pull.deletions}</span>
      </span>
      <div className={ACTION}>
        <RowAction
          pull={pull}
          inReview={inReview}
          onOpenTicket={onOpenTicket}
          onAddReview={onAddReview}
        />
      </div>
    </li>
  );
}
