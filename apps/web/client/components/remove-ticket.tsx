import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../lib/api';
import { Button, ErrorText } from './ui';

/** A cancelled ticket can leave Union; a second click confirms, since nothing brings it back. */
export function RemoveTicket({
  ticketId,
  onRemoved,
}: {
  ticketId: number;
  onRemoved: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.removeTicket(ticketId),
    onSuccess: async () => {
      onRemoved();
      queryClient.removeQueries({ queryKey: ['ticket', ticketId] });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  if (!confirming) {
    return (
      <Button
        variant="danger"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Remove ticket
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-red-300 p-3 dark:border-red-900">
      <p className="text-sm">
        Remove this ticket from Union, with its runs, outputs, reviews, files and agent container?
        The GitHub issue and the Notion page stay as they are.
      </p>
      <ErrorText error={remove.error} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {remove.isPending ? 'Removing…' : 'Remove for good'}
        </Button>
        <Button
          onClick={() => {
            setConfirming(false);
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}
