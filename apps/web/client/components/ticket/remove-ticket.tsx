// A cancelled ticket can leave Union; it asks first, since nothing brings it back.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { originName } from '../../lib/ticket/ticket-origin';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorText } from '../ui/ui';

/** What removing leaves alone: "The GitHub issue and the Notion page stay as they are." */
function keptElsewhere(ticket: TicketDetail['ticket']): string {
  const origin = originName(ticket.originKind);
  const kept = [
    ...(ticket.issueNumber === null ? [] : ['the GitHub issue']),
    ...(origin === null ? [] : [`the ${origin}`]),
  ];
  if (kept.length === 0) {
    return '';
  }
  const sentence = `${kept.join(' and ')} ${kept.length === 1 ? 'stays as it is' : 'stay as they are'}.`;
  return ` ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}

/** A cancelled ticket can leave Union; it asks first, since nothing brings it back. */
export function RemoveTicket({
  ticket,
  onRemoved,
}: {
  ticket: TicketDetail['ticket'];
  onRemoved: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.removeTicket(ticket.id),
    onSuccess: async () => {
      onRemoved();
      queryClient.removeQueries({ queryKey: ['ticket', ticket.id] });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  return (
    <div className="space-y-1">
      <ConfirmButton
        label={remove.isPending ? 'Removing…' : 'Remove ticket'}
        wide
        question={`Remove it from Union, with its runs, outputs, reviews, files and agent container?${keptElsewhere(ticket)}`}
        confirmLabel="Remove for good"
        disabled={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
      <ErrorText error={remove.error} />
    </div>
  );
}
