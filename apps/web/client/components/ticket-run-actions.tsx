// What a ticket's command output can become: kept for the implementer's next run, or sent now as a revision.
import type { ContainerRun } from '@union/core';
import type { ReactElement } from 'react';

import { useRunAgent } from '../lib/use-run-agent';
import { RunAgentActions } from './run-agent-actions';
import { ErrorText } from './ui';

export function TicketRunActions({
  ticketId,
  run,
  canSend,
}: {
  ticketId: number;
  run: ContainerRun;
  canSend: boolean;
}): ReactElement {
  const { keep, send } = useRunAgent(ticketId);
  return (
    <>
      <RunAgentActions
        run={run}
        canSend={canSend}
        pending={keep.isPending || send.isPending}
        onKeep={(value) => {
          keep.mutate({ runId: run.id, keep: value });
        }}
        onSend={(note) => {
          send.mutate({ runId: run.id, note });
        }}
      />
      <ErrorText error={keep.error ?? send.error} />
    </>
  );
}
