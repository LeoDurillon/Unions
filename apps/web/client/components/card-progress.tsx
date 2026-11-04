// A running ticket's card line: how long its run has gone, and what its agent did last (and how
// long ago, once it has been quiet a while: a stuck run shows).
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { clock, timeAgo } from '../lib/relative-time';
import { useNow } from '../lib/use-now';
import { useRunProgress } from '../lib/use-run-progress';

/** After this long without a new message, the line says how long the agent has been quiet. */
const QUIET_MS = 120_000;

/** The first line of what the agent wrote, or the tool it called: the whole text on hover. */
function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim() !== '') ?? text;
}

function ProgressLine({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  const progress = useRunProgress(ticket.projectId, ticket.id);
  const now = useNow(progress !== undefined);
  if (!progress) {
    return null;
  }
  const { latest } = progress;
  const quiet = latest !== null && now - latest.at >= QUIET_MS;
  return (
    <div className="space-y-0.5 text-xs text-zinc-500">
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums" title="How long this run has gone">
          {clock(now - progress.startedAt)}
        </span>
        {quiet ? (
          <span className="text-amber-600 dark:text-amber-400">
            · last message {timeAgo(latest.at, now)}
          </span>
        ) : null}
      </div>
      <p
        className={`truncate ${latest?.kind === 'tool' ? 'font-mono' : ''} ${latest ? '' : 'text-zinc-400'}`}
        title={latest?.text}
      >
        {latest ? firstLine(latest.text) : 'Starting…'}
      </p>
    </div>
  );
}

/** Shown only while the ticket's step runs; reads the board's shared progress poll. */
export function CardProgress({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  return ticket.phase.kind === 'running' ? <ProgressLine ticket={ticket} /> : null;
}
