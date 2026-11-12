// The project's API-equivalent cost per week, as bars over a round scale; a bar's figures on hover
// or focus.

import type { ProjectUsage } from '@union/core';
import { useState, type ReactElement } from 'react';

import { count } from '../../lib/log/token-counts';
import { niceTicks } from '../../lib/usage/nice-scale';
import { costText } from '../../lib/usage/usage-format';

type Week = ProjectUsage['weeks'][number];

const PERCENT = 100;
/** Past this many weeks, only every other one is named under its bar. */
const NAMED_WEEKS = 12;
const DAY_SHOWN = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;

function weekName(week: Week): string {
  return new Date(week.start).toLocaleDateString([], DAY_SHOWN);
}

function Tooltip({ week }: { week: Week }): ReactElement {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium">Week of {weekName(week)}</div>
      <div className="tabular-nums">
        {costText(week.costUsd)} · {week.calls} call{week.calls === 1 ? '' : 's'} ·{' '}
        {count(week.input)} in
      </div>
    </div>
  );
}

function Bar({
  week,
  top,
  shown,
  onShow,
}: {
  week: Week;
  top: number;
  shown: boolean;
  onShow: (start: number | null) => void;
}): ReactElement {
  const height = (week.costUsd / top) * PERCENT;
  return (
    <button
      type="button"
      aria-label={`Week of ${weekName(week)}: ${costText(week.costUsd)}, ${week.calls} calls`}
      onMouseEnter={() => {
        onShow(week.start);
      }}
      onMouseLeave={() => {
        onShow(null);
      }}
      onFocus={() => {
        onShow(week.start);
      }}
      onBlur={() => {
        onShow(null);
      }}
      className="relative flex h-full min-w-0 flex-1 items-end focus:outline-none"
    >
      <span
        className={`mx-auto w-full max-w-12 rounded-t-[4px] transition ${shown ? 'bg-indigo-600 dark:bg-indigo-300' : 'bg-indigo-500 dark:bg-indigo-400'}`}
        style={{ height: `${height}%`, minHeight: week.costUsd > 0 ? 2 : 0 }}
      />
      {shown ? <Tooltip week={week} /> : null}
    </button>
  );
}

function Grid({ ticks }: { ticks: number[] }): ReactElement {
  const top = ticks.at(-1) ?? 1;
  return (
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <div
          key={tick}
          className="absolute right-0 left-0 border-t border-zinc-200 dark:border-zinc-800"
          style={{ bottom: `${(tick / top) * PERCENT}%` }}
        >
          <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] text-zinc-500 tabular-nums">
            ${tick}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One bar per week; nothing to draw before any week. */
export function WeeksChart({ weeks }: { weeks: Week[] }): ReactElement | null {
  const [shown, setShown] = useState<number | null>(null);
  if (weeks.length === 0) {
    return null;
  }
  const ticks = niceTicks(Math.max(...weeks.map((week) => week.costUsd)));
  const top = ticks.at(-1) ?? 1;
  const every = weeks.length > NAMED_WEEKS ? 2 : 1;
  return (
    <figure className="space-y-1 pt-2 pl-12">
      <figcaption className="sr-only">API-equivalent cost per week</figcaption>
      <div className="relative h-44">
        <Grid ticks={ticks} />
        <div className="relative flex h-full items-end gap-[2px]">
          {weeks.map((week) => (
            <Bar
              key={week.start}
              week={week}
              top={top}
              shown={shown === week.start}
              onShow={setShown}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-[2px] text-[11px] text-zinc-500">
        {weeks.map((week, index) => (
          <span key={week.start} className="min-w-0 flex-1 truncate text-center">
            {index % every === 0 ? weekName(week) : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
