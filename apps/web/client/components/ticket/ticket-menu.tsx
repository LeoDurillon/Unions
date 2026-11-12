// The header's ⋯ menu: the actions that end a ticket, kept out of the way: Cancel ticket, then Remove ticket.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { ConfirmButton } from '../ui/confirm-button';
import { MoreMenu } from '../ui/more-menu';
import { ErrorText } from '../ui/ui';
import { RemoveTicket } from './remove-ticket';

function CancelTicket({ ticketId }: { ticketId: number }): ReactElement {
  const { command } = useTicketCommands(ticketId);
  return (
    <div className="space-y-1">
      <ConfirmButton
        label="Cancel ticket"
        question="Stop it, and close its issue and open pull requests on GitHub?"
        confirmLabel="Cancel ticket"
        disabled={command.isPending}
        onConfirm={() => {
          command.mutate({ type: 'cancel' });
        }}
      />
      <ErrorText error={command.error} />
    </div>
  );
}

/** The header's ⋯ menu; nothing for a ticket that is done, which has nothing left to end. */
export function TicketMenu({
  detail,
  onRemoved,
}: {
  detail: TicketDetail;
  onRemoved: () => void;
}): ReactElement | null {
  const { kind } = detail.ticket.phase;
  if (kind === 'done') {
    return null;
  }
  return (
    <MoreMenu>
      {kind === 'cancelled' ? (
        <RemoveTicket ticketId={detail.ticket.id} onRemoved={onRemoved} />
      ) : (
        <CancelTicket ticketId={detail.ticket.id} />
      )}
    </MoreMenu>
  );
}
