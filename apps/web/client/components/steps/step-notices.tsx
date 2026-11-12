// What stops the step and needs the user: a failed run, a usage limit, a refused commit.

import type { Phase, Step } from '@union/core';
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { timeOfDay, timeUntil } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Button, ErrorText } from '../ui/ui';
import { RefusedCommitPanel } from './refused-commit';
import { StartOver } from './start-over';

type StalledPhase = Extract<Phase, { kind: 'failed' | 'rate_limited' }>;

/** The card's title: what stopped the step. */
function stalledTitle(phase: StalledPhase): string {
  return phase.kind === 'failed' ? 'The run failed' : 'Claude usage limit reached';
}

/** What happened, and for a usage limit when Union retries by itself. */
function stalledMessage(phase: StalledPhase, now: number): string {
  if (phase.kind === 'failed') {
    return phase.error;
  }
  if (phase.retryAt === null) {
    return 'Retry when it resets.';
  }
  return phase.retryAt <= now
    ? 'Union retries it now.'
    : `Union retries it at ${timeOfDay(phase.retryAt, now)} (${timeUntil(phase.retryAt, now)}).`;
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
  return (
    <section className="flex flex-wrap items-start gap-3.5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white font-bold text-red-700 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
      >
        !
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-[15px] font-semibold">{stalledTitle(phase)}</h3>
        <p className="text-sm whitespace-pre-wrap text-red-800 dark:text-red-300">
          {stalledMessage(phase, now)}
        </p>
        <ErrorText error={command.error} />
      </div>
      {/* Straight in the card's row: Start over's question takes a whole line of it. */}
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
    </section>
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
