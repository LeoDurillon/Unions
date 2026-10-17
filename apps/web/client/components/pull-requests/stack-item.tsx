// A stack of pull requests as one row: its bottom's title, its size, adding it to the reviews; its members below when opened.
import { useState, type ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { addableMembers } from '../../lib/pull-request-stacks';
import { Badge, Button } from '../ui';
import { PullRequestItem } from './pull-request-item';

/** Adds the members that can be added: all of them, or those not under review yet. */
function StackAction({
  pulls,
  inReview,
  adding,
  onAdd,
}: {
  pulls: PullRequestListItem[];
  inReview: Set<number>;
  adding: boolean;
  onAdd: (pulls: PullRequestListItem[]) => void;
}): ReactElement | null {
  const unlinked = pulls.filter((pull) => pull.ticketId === null);
  const addable = addableMembers(pulls, inReview);
  if (unlinked.length === 0) {
    return null;
  }
  if (addable.length === 0) {
    return <Badge tone="blue">in reviews</Badge>;
  }
  return (
    <Button
      disabled={adding}
      onClick={() => {
        onAdd(addable);
      }}
    >
      {addable.length === unlinked.length
        ? 'Add stack to reviews'
        : `Add ${addable.length} to reviews`}
    </Button>
  );
}

function StackSummary({ pulls }: { pulls: PullRequestListItem[] }): ReactElement {
  const [first] = pulls;
  const last = pulls.at(-1);
  const additions = pulls.reduce((sum, pull) => sum + pull.additions, 0);
  const deletions = pulls.reduce((sum, pull) => sum + pull.deletions, 0);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="truncate text-sm font-medium">{first?.title}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
        <span>
          #{first?.number} to #{last?.number}
        </span>
        <span className="truncate font-mono">→ {first?.baseBranch}</span>
        <span className="font-mono">
          <span className="text-green-700 dark:text-green-400">+{additions}</span>{' '}
          <span className="text-red-700 dark:text-red-400">−{deletions}</span>
        </span>
      </p>
    </div>
  );
}

/** A stack of pull requests, bottom first: one row, opened to list its members. */
export function StackItem({
  pulls,
  inReview,
  joinsOf,
  adding,
  onOpenTicket,
  onAddReview,
  onAddStack,
}: {
  pulls: PullRequestListItem[];
  inReview: Set<number>;
  joinsOf: (pull: PullRequestListItem) => number | null;
  adding: boolean;
  onOpenTicket: (id: number) => void;
  onAddReview: (pull: PullRequestListItem) => void;
  onAddStack: (pulls: PullRequestListItem[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            open ? 'Hide the pull requests of the stack' : 'Show the pull requests of the stack'
          }
          onClick={() => {
            setOpen(!open);
          }}
          className="w-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {open ? '▾' : '▸'}
        </button>
        <Badge tone="neutral">stack of {pulls.length}</Badge>
        <StackSummary pulls={pulls} />
        <StackAction pulls={pulls} inReview={inReview} adding={adding} onAdd={onAddStack} />
      </div>
      {open ? (
        <ul className="border-t border-zinc-200 pl-8 dark:border-zinc-800">
          {pulls.map((pull) => (
            <PullRequestItem
              key={pull.number}
              pull={pull}
              inReview={inReview.has(pull.number)}
              joins={joinsOf(pull)}
              onOpenTicket={onOpenTicket}
              onAddReview={() => {
                onAddReview(pull);
              }}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
