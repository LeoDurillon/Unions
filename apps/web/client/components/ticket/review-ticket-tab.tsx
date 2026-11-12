// The review page's Ticket tab: the ticket's whole title and its description, in one card.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { CARD_CLASS } from '../ui/ui';
import { TicketDescription } from './ticket-description';

/** The review header cuts a long title short; the card says it whole, above what was asked. */
export function ReviewTicketTab({ ticket }: { ticket: TicketDetail['ticket'] }): ReactElement {
  return (
    <div className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-tight">
        {ticket.issueNumber === null ? null : (
          <span className="mr-2 font-mono text-sm font-normal text-zinc-500">
            #{ticket.issueNumber}
          </span>
        )}
        {ticket.title}
      </h2>
      <TicketDescription ticket={ticket} />
    </div>
  );
}
