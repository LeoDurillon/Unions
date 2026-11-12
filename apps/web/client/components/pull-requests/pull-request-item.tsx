// One pull request on one line of the list's table, and the table's column names. A row holds its state, title,
// branches and review, author, date, its size as a bar, and what can be done with it.
import type { ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { formatWhen } from '../../lib/ui/relative-time';
import { Badge, Button } from '../ui/ui';

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'neutral';

/** The table's columns: state, pull request, author, updated, size, action (author and date go on a narrow screen). */
const COLUMNS =
  'grid grid-cols-[5rem_minmax(0,1fr)_8.5rem] items-center gap-3 px-4 lg:grid-cols-[5rem_minmax(0,1fr)_9rem_8rem_10.5rem_8.5rem]';
export const ACTION = 'flex w-36 shrink-0 justify-end';
const WIDE_ONLY = 'max-lg:hidden';
const SIZE_BAR_PX = 56;

function stateBadge(pull: PullRequestListItem): { label: string; tone: Tone } {
  if (pull.state === 'merged') {
    return { label: 'merged', tone: 'blue' };
  }
  if (pull.state === 'closed') {
    return { label: 'closed', tone: 'red' };
  }
  return pull.draft ? { label: 'draft', tone: 'neutral' } : { label: 'open', tone: 'green' };
}

/** The table's column names, above its rows. */
export function PullRequestColumns(): ReactElement {
  return (
    <div
      aria-hidden
      className={`${COLUMNS} border-b border-zinc-200 py-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-zinc-800`}
    >
      <span>State</span>
      <span>Pull request</span>
      <span className={WIDE_ONLY}>Author</span>
      <span className={WIDE_ONLY}>Updated</span>
      <span className={WIDE_ONLY}>Size</span>
      <span />
    </div>
  );
}

/** Lines added and removed: a small bar of their shares, then the numbers. */
function SizeCell({ pull }: { pull: PullRequestListItem }): ReactElement {
  const total = Math.max(1, pull.additions + pull.deletions);
  const added = Math.round((SIZE_BAR_PX * pull.additions) / total);
  return (
    <span className={`flex items-center gap-2 ${WIDE_ONLY}`}>
      <span
        aria-hidden
        className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        style={{ width: SIZE_BAR_PX }}
      >
        <span className="bg-emerald-500" style={{ width: added }} />
        <span className="flex-1 bg-red-400" />
      </span>
      <span className="font-mono text-[11px] whitespace-nowrap">
        <span className="text-green-700 dark:text-green-400">+{pull.additions}</span>{' '}
        <span className="text-red-700 dark:text-red-400">−{pull.deletions}</span>
      </span>
    </span>
  );
}

/** Two letters for the author's login, in a small circle. */
function Author({ login }: { login: string }): ReactElement {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 ${WIDE_ONLY}`}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold text-zinc-700 uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {login.slice(0, 2)}
      </span>
      <span className="truncate">{login}</span>
    </span>
  );
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
        size="sm"
        className="py-1"
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
    <Button
      variant="ghost"
      size="sm"
      title="Review it in Union without a ticket: its diff, a preview and comments"
      onClick={onAddReview}
    >
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
    <li className={`${COLUMNS} py-2.5`}>
      <span>
        <Badge tone={state.tone}>{state.label}</Badge>
      </span>
      <div className="min-w-0 space-y-0.5">
        <a
          href={pull.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[13px] font-semibold hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
        >
          {pull.title}
        </a>
        <p className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-500">
          <span className="truncate font-mono">
            #{pull.number} · {pull.headBranch} → {pull.baseBranch}
          </span>
          {review ? <Badge tone={review.tone}>{review.label}</Badge> : null}
          {joins === null ? null : (
            <span className="shrink-0">joins the stack of #{joins} in reviews</span>
          )}
        </p>
      </div>
      <Author login={pull.author} />
      <span className={`text-xs text-zinc-500 ${WIDE_ONLY}`}>{formatWhen(pull.updatedAt)}</span>
      <SizeCell pull={pull} />
      <div className="flex justify-end">
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
