// The sidebar's Claude usage: how much of the subscription's five-hour and weekly windows is used and
// when each starts over, as the agents' last call reported it.
import type { ClaudeLimits, LimitWindow } from '@union/core';
import type { ReactElement } from 'react';

import { timeAgo } from '../../lib/relative-time';
import { useNow } from '../../lib/use-now';
import { useClaudeLimits } from '../../lib/use-usage';

const PERCENT = 100;
/** From here a window is close to its limit. */
const WARNING = 0.8;
/** A report older than this says how old it is: usage outside Union is not in it. */
const STALE_MS = 600_000;
const HOURS_SHOWN = { hour: '2-digit', minute: '2-digit' } as const;
const DAY_SHOWN = { weekday: 'short', hour: '2-digit', minute: '2-digit' } as const;

type Level = 'ok' | 'warning' | 'limit';

function levelOf(window: LimitWindow, rejected: boolean): Level {
  if (rejected || window.utilization >= 1) {
    return 'limit';
  }
  return window.utilization >= WARNING ? 'warning' : 'ok';
}

const BAR_CLASS: Record<Level, string> = {
  ok: 'bg-indigo-500 dark:bg-indigo-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  limit: 'bg-red-600 dark:bg-red-500',
};

/** One window: its name, how much is used, a bar, and when it starts over (or that it did). */
function WindowRow({
  label,
  window,
  rejected,
  now,
  long,
}: {
  label: string;
  window: LimitWindow;
  rejected: boolean;
  now: number;
  /** Weekly: the reset names its day. */
  long: boolean;
}): ReactElement {
  const reset = new Date(window.resetsAt).toLocaleString([], long ? DAY_SHOWN : HOURS_SHOWN);
  const over = window.resetsAt <= now;
  const percent = Math.round(window.utilization * PERCENT);
  const level = levelOf(window, rejected);
  return (
    <div className="space-y-0.5" title={over ? `Started over at ${reset}` : `Starts over ${reset}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="tabular-nums">
          {over ? 'reset' : `${percent}%`}
          {level === 'limit' && !over ? ' · limit' : ''}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${BAR_CLASS[level]}`}
          style={{ width: `${over ? 0 : Math.min(percent, PERCENT)}%` }}
        />
      </div>
      <div className="text-[11px] text-zinc-500">
        {over ? `started over ${reset}` : `resets ${reset}`}
      </div>
    </div>
  );
}

function Windows({ limits, now }: { limits: ClaudeLimits; now: number }): ReactElement {
  const rejected = limits.status === 'rejected';
  return (
    <>
      {limits.fiveHour ? (
        <WindowRow
          label="5 hours"
          window={limits.fiveHour}
          rejected={rejected}
          now={now}
          long={false}
        />
      ) : null}
      {limits.sevenDay ? (
        <WindowRow label="Week" window={limits.sevenDay} rejected={rejected} now={now} long />
      ) : null}
      {now - limits.at > STALE_MS ? (
        <p className="text-[11px] text-zinc-500">As of {timeAgo(limits.at, now)}</p>
      ) : null}
    </>
  );
}

/** The highest share used of a window not reset yet, for the folded rail. */
function railText(limits: ClaudeLimits, now: number): string {
  const shares = [limits.fiveHour, limits.sevenDay]
    .filter((window) => window !== null && window.resetsAt > now)
    .map((window) => window?.utilization ?? 0);
  return shares.length === 0 ? '–' : `${Math.round(Math.max(...shares) * PERCENT)}%`;
}

const ABOUT =
  'From the last call of a Union agent: usage outside Union (Claude Code, claude.ai) shows at the next one.';

/** Hidden until an agent call reported the windows. */
export function ClaudeMeter(): ReactElement | null {
  const limits = useClaudeLimits().data ?? null;
  const now = useNow(limits !== null);
  if (!limits) {
    return null;
  }
  return (
    <section aria-label="Claude usage" title={ABOUT} className="px-2">
      <div className="space-y-2 group-data-[compact]/side:hidden">
        <h2 className="text-xs font-medium text-zinc-500 uppercase">Claude usage</h2>
        <Windows limits={limits} now={now} />
      </div>
      <p className="hidden text-center text-xs tabular-nums group-data-[compact]/side:block">
        {railText(limits, now)}
      </p>
    </section>
  );
}
