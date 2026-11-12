// A board card's flow as a thin bar of segments, one per step: done, running, waiting, stalled or still to come.

import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../../src/api-types';
import { cardSegments } from '../../lib/board/card-steps';
import type { StopState } from '../../lib/ticket/ticket-progress';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';

const SEGMENT: Record<StopState, string> = {
  done: 'bg-emerald-500',
  running: 'animate-pulse bg-blue-500',
  waiting: 'bg-amber-500',
  stalled: 'bg-red-500',
  todo: 'bg-zinc-200 dark:bg-zinc-800',
};

const STATE_WORDS: Record<StopState, string> = {
  done: 'done',
  running: 'running',
  waiting: 'waiting for you',
  stalled: 'stopped',
  todo: 'to come',
};

export function CardSteps({
  ticket,
  config,
}: {
  ticket: TicketSummary;
  config: PublicProject['config'];
}): ReactElement | null {
  const names = useCustomAgentNames();
  const segments = cardSegments(ticket, config, names);
  if (!segments || segments.length === 0) {
    return null;
  }
  const summary = segments.map((segment) => `${segment.label}: ${STATE_WORDS[segment.state]}`);
  return (
    <div title={summary.join('\n')}>
      <span className="sr-only">{summary.join(', ')}</span>
      <div aria-hidden className="flex gap-1">
        {segments.map((segment) => (
          <span key={segment.id} className={`h-1 flex-1 rounded-full ${SEGMENT[segment.state]}`} />
        ))}
      </div>
    </div>
  );
}
