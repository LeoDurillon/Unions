// Start over: a planning or custom step runs again from scratch, after a confirmation.

import { canStartOver, type Phase } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { Button, ErrorText } from '../ui/ui';

/** Nothing unless the ticket's step can start over; a second click confirms. */
export function StartOver({
  ticketId,
  phase,
}: {
  ticketId: number;
  phase: Phase;
}): ReactElement | null {
  const { command } = useTicketCommands(ticketId);
  const [confirming, setConfirming] = useState(false);
  if (!canStartOver(phase)) {
    return null;
  }
  if (!confirming) {
    return (
      <Button
        variant="quietDanger"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Start over
      </Button>
    );
  }
  return (
    <div className="basis-full space-y-2 rounded-lg border border-red-300 p-3 dark:border-red-900">
      <p className="text-sm">
        Run this step again from scratch? The agent starts a new session and does not see the
        versions it wrote or your feedback. They stay in the history.
      </p>
      <ErrorText error={command.error} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={command.isPending}
          onClick={() => {
            command.mutate({ type: 'start_over' });
          }}
        >
          {command.isPending ? 'Starting over…' : 'Start over'}
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
