// What stops the step and needs the user: a failed run, a usage limit, a refused commit.
import type { Phase, Step } from '@union/core';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { timeOfDay, timeUntil } from '../lib/relative-time';
import { useNow } from '../lib/use-now';
import { useTicketCommands } from '../lib/use-ticket-commands';
import { RefusedCommitPanel } from './refused-commit';
import { StartOver } from './start-over';
import { Button, ErrorText } from './ui';

type StalledPhase = Extract<Phase, { kind: 'failed' | 'rate_limited' }>;

/** What happened, and for a usage limit when Union retries by itself. */
function stalledMessage(phase: StalledPhase, now: number): string {
  if (phase.kind === 'failed') {
    return `Run failed: ${phase.error}`;
  }
  if (phase.retryAt === null) {
    return 'Claude usage limit reached. Retry when it resets.';
  }
  return phase.retryAt <= now
    ? 'Claude usage limit reached. Union retries it now.'
    : `Claude usage limit reached. Union retries it at ${timeOfDay(phase.retryAt, now)} (${timeUntil(phase.retryAt, now)}).`;
}

function Stalled({ detail, step }: { detail: TicketDetail; step: Step }): ReactElement | null {
  const { phase, id } = detail.ticket;
  const { command } = useTicketCommands(id);
  const waits = phase.kind === 'rate_limited' && phase.retryAt !== null;
  // Ticks while a retry is due, so "in 5 min" counts down.
  const now = useNow(waits);
  if ((phase.kind !== 'failed' && phase.kind !== 'rate_limited') || phase.step !== step) {
    return null;
  }
  const message = stalledMessage(phase, now);
  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm">{message}</p>
      <ErrorText error={command.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={command.isPending}
          onClick={() => {
            command.mutate({ type: 'retry' });
          }}
        >
          {waits ? 'Retry now' : 'Retry'}
        </Button>
        <StartOver ticketId={id} phase={phase} />
      </div>
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
