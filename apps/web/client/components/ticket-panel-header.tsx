// The header of the ticket panel: its title, phase badge, the way to the next ticket that needs
// the user, and the review and close buttons.
import type { ReactElement } from 'react';

import type { TicketDetail, TicketSummary } from '../../src/api-types';
import { investigateTicket } from '../lib/investigate-ticket';
import { describePhase } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import type { NeedingYou } from './ticket-panel-keys';
import { Badge, Button, CloseButton } from './ui';

/** The final review waits for the user: reading the changes is what comes next. */
function waitsForCodeReview(detail: TicketDetail): boolean {
  const { phase } = detail.ticket;
  return phase.kind === 'awaiting_approval' && phase.step === 'final_review';
}

/** The next ticket that needs the user (`n`), with how many others do; none when no other does. */
function NextNeeding({
  next,
  others,
  onOpen,
}: {
  next: TicketSummary | null;
  others: number;
  onOpen: (id: number) => void;
}): ReactElement | null {
  if (!next) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      className="whitespace-nowrap"
      title={`Open “${next.title}”, the next ticket that needs you (n; p goes back)`}
      onClick={() => {
        onOpen(next.id);
      }}
    >
      Next needing you
      <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
        {others}
      </span>
    </Button>
  );
}

export function TicketPanelHeader({
  detail,
  onReview,
  onClose,
  needing,
  onOpenTicket,
}: {
  detail: TicketDetail | undefined;
  onReview: () => void;
  onClose: () => void;
  /** The next ticket on the board that needs the user, and how many other than this one do. */
  needing: NeedingYou;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const names = useCustomAgentNames();
  const phase = detail ? describePhase(detail.ticket.phase, names) : null;
  const title = detail?.ticket.title ?? 'Loading…';
  return (
    <header className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="line-clamp-2 text-base leading-snug font-semibold" title={title}>
          {title}
        </h2>
        {phase ? <Badge tone={phase.tone}>{phase.label}</Badge> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NextNeeding next={needing.next} others={needing.others} onOpen={onOpenTicket} />
        {detail ? (
          <Button
            className="whitespace-nowrap"
            title="Run an investigation in this ticket's workspace, as its agent left it"
            onClick={() => {
              investigateTicket(detail.ticket.id);
            }}
          >
            Investigate
          </Button>
        ) : null}
        {detail?.ticket.branch ? (
          <Button
            className="whitespace-nowrap"
            variant={waitsForCodeReview(detail) ? 'primary' : 'secondary'}
            title="Review the changes (r)"
            onClick={onReview}
          >
            Review changes
          </Button>
        ) : null}
        <CloseButton onClick={onClose} />
      </div>
    </header>
  );
}
