// A stack of pull requests as one row: its bottom's title, its size, adding it to the reviews (or its ticket); its members below when opened.
import { useState, type ReactElement } from 'react';

import type { PullRequestListItem } from '../../../src/api-types';
import { addableMembers, unlistedMembers, type StackRow } from '../../lib/pull-request-stacks';
import { Badge, Button } from '../ui';
import { ACTION, PullRequestItem } from './pull-request-item';

/** The ticket every listed member belongs to (a split ticket's stack), if they share one. */
function ticketOf(pulls: PullRequestListItem[]): number | null {
  const [first, ...rest] = pulls;
  const id = first?.ticketId ?? null;
  return id !== null && rest.every((pull) => pull.ticketId === id) ? id : null;
}

/** Opens the stack's ticket, else adds the members that can be added: all, or those not in yet. */
function StackAction({
  pulls,
  inReview,
  adding,
  onAdd,
  onOpenTicket,
}: {
  pulls: PullRequestListItem[];
  inReview: Set<number>;
  adding: boolean;
  onAdd: (pulls: PullRequestListItem[]) => void;
  onOpenTicket: (id: number) => void;
}): ReactElement | null {
  const ticket = ticketOf(pulls);
  if (ticket !== null) {
    return (
      <Button
        onClick={() => {
          onOpenTicket(ticket);
        }}
      >
        Open ticket
      </Button>
    );
  }
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

function StackSummary({ row }: { row: StackRow }): ReactElement {
  const { pulls } = row;
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
        <span className="truncate font-mono">→ {row.github?.base ?? first?.baseBranch}</span>
        <span className="font-mono">
          <span className="text-green-700 dark:text-green-400">+{additions}</span>{' '}
          <span className="text-red-700 dark:text-red-400">−{deletions}</span>
        </span>
      </p>
    </div>
  );
}

/** The members GitHub has in the stack that the list does not show: merged, or older than it. */
function Unlisted({ row }: { row: StackRow }): ReactElement | null {
  const unlisted = unlistedMembers(row);
  if (unlisted.length === 0) {
    return null;
  }
  return (
    <li className="px-4 py-2 text-xs text-zinc-500">
      Not in this list:{' '}
      {unlisted
        .map((pull) => `#${pull.number} (${pull.mergedAt === null ? pull.state : 'merged'})`)
        .join(', ')}
    </li>
  );
}

/** A stack's size on GitHub, and how many of it merged. */
function SizeBadges({ row }: { row: StackRow }): ReactElement {
  const all = row.github?.pullRequests ?? row.pulls;
  const merged = (row.github?.pullRequests ?? []).filter((pull) => pull.mergedAt !== null).length;
  return (
    <>
      <Badge tone="neutral">stack of {all.length}</Badge>
      {merged > 0 ? <Badge tone="blue">{merged} merged</Badge> : null}
    </>
  );
}

function Toggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={
        open ? 'Hide the pull requests of the stack' : 'Show the pull requests of the stack'
      }
      onClick={() => {
        onToggle(!open);
      }}
      className="w-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

/** A stack of pull requests, bottom first: one row, opened to list its members. */
export function StackItem({
  row,
  inReview,
  joinsOf,
  adding,
  onOpenTicket,
  onAddReview,
  onAddStack,
}: {
  row: StackRow;
  inReview: Set<number>;
  joinsOf: (pull: PullRequestListItem) => number | null;
  adding: boolean;
  onOpenTicket: (id: number) => void;
  onAddReview: (pull: PullRequestListItem) => void;
  onAddStack: (pulls: PullRequestListItem[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const { pulls } = row;
  return (
    <li className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <Toggle open={open} onToggle={setOpen} />
        <SizeBadges row={row} />
        <StackSummary row={row} />
        <div className={ACTION}>
          <StackAction
            pulls={pulls}
            inReview={inReview}
            adding={adding}
            onAdd={onAddStack}
            onOpenTicket={onOpenTicket}
          />
        </div>
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
          <Unlisted row={row} />
        </ul>
      ) : null}
    </li>
  );
}
