// What stops the step and needs the user: a failed run, a usage limit, a refused commit.
import type { Step } from '@union/core';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { useTicketCommands } from '../lib/use-ticket-commands';
import { RefusedCommitPanel } from './refused-commit';
import { Button, ErrorText } from './ui';

function Stalled({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement | null {
  const { phase, id } = detail.ticket;
  const { command } = useTicketCommands(id);
  if ((phase.kind !== 'failed' && phase.kind !== 'rate_limited') || phase.step !== step) {
    return null;
  }
  const message =
    phase.kind === 'failed'
      ? `Run failed: ${phase.error}`
      : 'Claude usage limit reached. Retry when it resets.';
  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm">{message}</p>
      <ErrorText error={command.error} />
      <Button
        variant="primary"
        disabled={command.isPending}
        onClick={() => {
          command.mutate({ type: 'retry' });
        }}
      >
        Retry
      </Button>
    </div>
  );
}

/** What stops the step and needs the user: a failed run, a usage limit, a refused commit. */
export function StepNotices({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement {
  return (
    <>
      <Stalled detail={detail} step={step} />
      <RefusedCommitPanel detail={detail} step={step} />
    </>
  );
}
