// The project at a glance, on the right of the board's toolbar: how many tickets need the user (a toggle that
// shows only them), run and wait for review, and how much of Claude's five-hour window is used.
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { needsYou } from '../lib/board-filter';
import { useNow } from '../lib/use-now';
import { useClaudeLimits } from '../lib/use-usage';

const PERCENT = 100;

function NeedsYouToggle({
  on,
  count,
  onChange,
}: {
  on: boolean;
  count: number;
  onChange: (on: boolean) => void;
}): ReactElement {
  const waiting = count > 0;
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Steps waiting for your approval, failures, refused commits and red CI checks (n opens the first)"
      onClick={() => {
        onChange(!on);
      }}
      className={`flex h-7.5 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition ${on ? 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100' : ''} ${!on && waiting ? 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' : ''} ${!on && !waiting ? 'border-zinc-200 text-zinc-500 dark:border-zinc-800' : ''}`}
    >
      {waiting ? (
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-60" />
          <span className="relative size-2 rounded-full bg-amber-500" />
        </span>
      ) : null}
      {count} need{count === 1 ? 's' : ''} you
    </button>
  );
}

/** The five-hour window's share used, as a small bar; nothing until an agent call reported it. */
function ClaudeShare(): ReactElement | null {
  const window = useClaudeLimits().data?.fiveHour ?? null;
  const now = useNow(window !== null);
  if (!window || window.resetsAt <= now) {
    return null;
  }
  const percent = Math.min(PERCENT, Math.round(window.utilization * PERCENT));
  const reset = new Date(window.resetsAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <span
      className="flex items-center gap-2 border-l border-zinc-200 pl-3 text-xs whitespace-nowrap text-zinc-500 max-sm:hidden dark:border-zinc-800"
      title={`Claude's five-hour window: ${percent}% used, resets ${reset}`}
    >
      Claude
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <span
          className="block h-full rounded-full bg-indigo-500"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="font-mono text-[11px] tabular-nums">{percent}% · 5 h</span>
    </span>
  );
}

export function BoardSummary({
  tickets,
  needsYouOn,
  onNeedsYou,
}: {
  tickets: TicketSummary[];
  needsYouOn: boolean;
  onNeedsYou: (on: boolean) => void;
}): ReactElement {
  const running = tickets.filter((ticket) => ticket.phase.kind === 'running').length;
  const reviewing = tickets.filter((ticket) => ticket.board === 'in_review').length;
  return (
    <div aria-label="The project at a glance" className="ml-auto flex items-center gap-3">
      <NeedsYouToggle
        on={needsYouOn}
        count={tickets.filter((ticket) => needsYou(ticket)).length}
        onChange={onNeedsYou}
      />
      <span className="text-xs whitespace-nowrap text-zinc-500 max-sm:hidden">
        {running} running
      </span>
      <span className="text-xs whitespace-nowrap text-zinc-500 max-sm:hidden">
        {reviewing} in review
      </span>
      <ClaudeShare />
    </div>
  );
}
