// A ticket card for the board: its issue and pull request, title, the ticket it builds on, state
// and way through the flow. It also shows its CI checks, stack and a branch moved on GitHub, what
// its agent is doing while it runs, and Start while it waits in the backlog.

import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../../src/api-types';
import { needsYou } from '../../lib/board/board-filter';
import { refLabel } from '../../lib/board/labels';
import { FOCUS_RING } from '../ui/focus';
import { CardMeta } from './card-meta';
import { CardProgress } from './card-progress';
import { CardSignals } from './card-signals';
import { CardStatus, StartAction } from './card-status';
import { CardSteps } from './card-steps';

/** The ticket it builds on, as a small chip: its whole title on hover. */
function ParentChip({ parent }: { parent: NonNullable<TicketSummary['parent']> }): ReactElement {
  return (
    <span
      title={`Starts after ${refLabel(parent)} ${parent.title}`}
      className="inline-block max-w-full truncate text-[11px] text-zinc-500 dark:text-zinc-400"
    >
      ↳ after {refLabel(parent)}
    </span>
  );
}

/** A card waiting for the user stands out in amber; a running one in blue. */
function cardTone(ticket: TicketSummary): string {
  if (needsYou(ticket)) {
    return 'border-amber-300 ring-1 ring-amber-200/70 dark:border-amber-800 dark:ring-amber-900/40';
  }
  if (ticket.phase.kind === 'running') {
    return 'border-blue-200 dark:border-blue-900';
  }
  return 'border-zinc-200 dark:border-zinc-800';
}

export function TicketCard({
  ticket,
  config,
  onOpen,
  onStart,
  starting = false,
  startError = null,
}: {
  ticket: TicketSummary;
  config?: PublicProject['config'];
  onOpen: (id: number) => void;
  onStart?: (id: number) => void;
  /** Start was clicked and the worker has not taken the ticket yet. */
  starting?: boolean;
  /** Why the last Start was refused. */
  startError?: string | null;
}): ReactElement {
  return (
    <div
      className={`relative space-y-2.5 rounded-xl border bg-white p-3.5 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-zinc-900 ${cardTone(ticket)}`}
    >
      <CardMeta ticket={ticket} config={config} />
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {
            onOpen(ticket.id);
          }}
          title={ticket.title}
          className={`line-clamp-3 text-left text-[13.5px] leading-snug font-semibold after:absolute after:inset-0 after:rounded-xl after:content-[''] ${FOCUS_RING}`}
        >
          {ticket.title}
        </button>
        {ticket.parent ? <ParentChip parent={ticket.parent} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        <CardStatus ticket={ticket} />
        <StartAction ticket={ticket} starting={starting} onStart={onStart} />
      </div>
      {/* Once done, every step is behind it: the column says so. */}
      {config && ticket.phase.kind !== 'done' ? (
        <CardSteps ticket={ticket} config={config} />
      ) : null}
      {startError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Not started: {startError}
        </p>
      ) : null}
      <CardProgress ticket={ticket} />
      <CardSignals ticket={ticket} />
    </div>
  );
}
