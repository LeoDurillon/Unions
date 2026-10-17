// The ticket panel's overview tab: run status, details, and the buttons that act on the ticket.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { isBlocked } from '../lib/labels';
import { useTicketCommands } from '../lib/use-ticket-commands';
import { RemoveTicket } from './remove-ticket';
import { RunTable } from './run-table';
import { TicketDescription } from './ticket-description';
import { TicketDetails } from './ticket-details';
import { Button, ErrorText } from './ui';

export function OverviewTab({
  detail,
  onOpenTicket,
  onRemoved,
  onOpenPreview,
}: {
  detail: TicketDetail;
  onOpenTicket: (id: number) => void;
  /** After a cancelled ticket is removed: the panel closes. */
  onRemoved: () => void;
  onOpenPreview: () => void;
}): ReactElement {
  const { ticket, runs } = detail;
  const blocked = isBlocked(ticket);
  const { command } = useTicketCommands(ticket.id);
  const { kind } = ticket.phase;
  const finished = kind === 'done' || kind === 'cancelled';

  return (
    <div className="space-y-4">
      <TicketDetails detail={detail} onOpenTicket={onOpenTicket} onOpenPreview={onOpenPreview} />
      <TicketDescription ticket={ticket} />
      <ErrorText error={command.error} />
      <div className="flex gap-2">
        {kind === 'backlog' ? (
          <Button
            variant="primary"
            disabled={command.isPending || blocked}
            title={blocked ? 'Waits for the parent ticket to be done' : undefined}
            onClick={() => {
              command.mutate({ type: 'start' });
            }}
          >
            Start
          </Button>
        ) : null}
        {kind === 'cancelled' ? <RemoveTicket ticketId={ticket.id} onRemoved={onRemoved} /> : null}
        {finished ? null : (
          <Button
            variant="danger"
            disabled={command.isPending}
            onClick={() => {
              command.mutate({ type: 'cancel' });
            }}
          >
            Cancel ticket
          </Button>
        )}
      </div>
      <RunTable ticketId={ticket.id} runs={runs} />
    </div>
  );
}
