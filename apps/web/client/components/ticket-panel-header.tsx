import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { investigateTicket } from '../lib/investigate-ticket';
import { describePhase } from '../lib/labels';
import { Badge, Button } from './ui';

export function TicketPanelHeader({
  detail,
  onReview,
  onClose,
}: {
  detail: TicketDetail | undefined;
  onReview: () => void;
  onClose: () => void;
}): ReactElement {
  const phase = detail ? describePhase(detail.ticket.phase) : null;
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
          <Button className="whitespace-nowrap" onClick={onReview}>
            Review changes
          </Button>
        ) : null}
        <button
          type="button"
          aria-label="Close"
          title="Close"
          className="rounded-md px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </header>
  );
}
