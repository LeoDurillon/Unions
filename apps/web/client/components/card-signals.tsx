// A board card's bottom line: its pull request's CI checks, a branch moved on GitHub, a split ticket's stack.
import type { ReactElement, ReactNode } from 'react';

import type { TicketSummary } from '../../src/api-types';

const SHORT_SHA = 7;

const CHECKS: Record<
  NonNullable<TicketSummary['prChecksState']>,
  { label: string; icon: string; color: string }
> = {
  pending: { label: 'Checks running', icon: '◌', color: 'text-amber-700 dark:text-amber-300' },
  success: { label: 'Checks passed', icon: '✓', color: 'text-emerald-700 dark:text-emerald-400' },
  failure: { label: 'Checks failed', icon: '✕', color: 'text-red-700 dark:text-red-400' },
};

function Signal({
  icon,
  color,
  title,
  children,
}: {
  icon: string;
  color: string;
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span title={title} className={`inline-flex items-center gap-1 font-medium ${color}`}>
      <span aria-hidden className="text-[10px]">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** The CI checks of the open pull request's head commit; nothing when they are not known. */
function Checks({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  if (ticket.prState !== 'open' || ticket.prChecksState === null) {
    return null;
  }
  const { label, icon, color } = CHECKS[ticket.prChecksState];
  const sha = ticket.prChecksSha?.slice(0, SHORT_SHA);
  return (
    <Signal icon={icon} color={color} title={sha ? `CI checks on ${sha}` : undefined}>
      {label}
    </Signal>
  );
}

/** A split ticket: its stack's size, what merged, and its pull requests on hover. */
function Stack({ stack }: { stack: NonNullable<TicketSummary['stack']> }): ReactElement {
  const prs = stack.slices.flatMap((slice) =>
    slice.prNumber === null ? [] : [`#${slice.prNumber}`],
  );
  const wrong = stack.outOfOrder.length > 0 || stack.closed.length > 0;
  const color = wrong ? 'text-red-700 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400';
  return (
    <Signal icon="≡" color={color} title={prs.join(' → ')}>
      {stack.label}
    </Signal>
  );
}

/** Nothing when the ticket has none of them. */
export function CardSignals({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  // The branch moved on GitHub since Union pushed it: the Pull request tab offers a resync.
  const moved = ticket.prState === 'open' && ticket.remoteMoved !== null;
  const checks = ticket.prState === 'open' && ticket.prChecksState !== null;
  if (!moved && !checks && !ticket.stack) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-[11px] dark:border-zinc-800">
      <Checks ticket={ticket} />
      {moved ? (
        <Signal
          icon="↯"
          color="text-amber-700 dark:text-amber-300"
          title="Resync it from the Pull request tab"
        >
          Branch moved
        </Signal>
      ) : null}
      {ticket.stack ? <Stack stack={ticket.stack} /> : null}
    </div>
  );
}
