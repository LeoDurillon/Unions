import type { ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { Badge, Button } from '../ui';

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'neutral';

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

/** What a row offers: its ticket when linked, else adding it to the current reviews (shown on hover). */
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
    <Button className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={onAddReview}>
      Add to reviews
    </Button>
  );
}

/** One pull request: state, title, who and when, branches, review, size, and what can be done with it. */
export function PullRequestItem({
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
  const state = stateBadge(pull);
  const review =
    pull.state === 'open' && pull.reviewDecision ? REVIEW_BADGES[pull.reviewDecision] : undefined;
  return (
    <li className="group flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
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
        </p>
      </div>
      <span className="shrink-0 font-mono text-xs">
        <span className="text-green-700 dark:text-green-400">+{pull.additions}</span>{' '}
        <span className="text-red-700 dark:text-red-400">−{pull.deletions}</span>
      </span>
      <RowAction
        pull={pull}
        inReview={inReview}
        onOpenTicket={onOpenTicket}
        onAddReview={onAddReview}
      />
    </li>
  );
}
