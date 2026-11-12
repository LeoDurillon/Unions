// One run of an agent log: its header (the step, when, its tool calls, model and use) and its rows, folded or open.

import { useState, type ReactElement } from 'react';

import type { LogRun } from '../../lib/log/log-runs';
import { formatWhen } from '../../lib/ui/relative-time';
import { Line, runTotal, type Entry } from './log-line';

/** The lines a long run shows at first: its end, where it stands now; the rest on a click. */
const SHOWN_LINES = 500;

/** A run's lines: the last 500 of a long one, with a button for the earlier ones. */
function RunLines({ lines }: { lines: LogRun<Entry>['lines'] }): ReactElement {
  const [all, setAll] = useState(false);
  const hidden = all ? 0 : Math.max(0, lines.length - SHOWN_LINES);
  return (
    <div>
      {hidden > 0 ? (
        <button
          type="button"
          className="text-xs text-indigo-700 hover:underline dark:text-indigo-300"
          onClick={() => {
            setAll(true);
          }}
        >
          Show the {hidden} earlier lines
        </button>
      ) : null}
      {lines.slice(hidden).map((entry) => (
        <Line key={entry.key} entry={entry} />
      ))}
    </div>
  );
}

/** `14:02–14:36 · 41 tool calls · claude-sonnet-4-5 · 2 calls · 4.1M in…`: the run in one line. */
function runFacts(run: LogRun<Entry>): string {
  const times = [run.header, ...run.lines].flatMap((entry) =>
    entry?.at === undefined ? [] : [entry.at],
  );
  const first = times.at(0);
  const last = times.at(-1);
  const span =
    first === undefined || last === undefined
      ? ''
      : `${formatWhen(first, 'time')}–${formatWhen(last, 'time')}`;
  const tools = run.lines.filter((entry) => entry.kind === 'tool').length;
  const model = run.lines.find((entry) => entry.model !== undefined)?.model;
  return [
    span,
    tools === 0 ? '' : `${tools} tool call${tools === 1 ? '' : 's'}`,
    model ?? '',
    runTotal(run),
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

function RunHeader({ run, running }: { run: LogRun<Entry>; running: boolean }): ReactElement {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        {running ? (
          <span
            aria-label="Running"
            className="size-2 shrink-0 animate-pulse rounded-full bg-indigo-500 motion-reduce:animate-none"
          />
        ) : null}
        {run.header ? (
          <Line entry={run.header} />
        ) : (
          <p className="font-semibold">Before the runs</p>
        )}
      </span>
      {/* The run's facts on a line of their own, so a long header does not wrap them. */}
      <span className="block text-xs text-zinc-500">{runFacts(run)}</span>
    </span>
  );
}

/** One run, folded unless it is the last one or the user opened it; `running` while it has not finished. */
export function RunSection({
  run,
  open,
  running,
  onToggle,
}: {
  run: LogRun<Entry>;
  open: boolean;
  running: boolean;
  onToggle: (open: boolean) => void;
}): ReactElement {
  return (
    <details
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
      className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-3">
        <span aria-hidden className="w-3 shrink-0 text-center text-zinc-500">
          {open ? '▾' : '▸'}
        </span>
        <RunHeader run={run} running={running} />
      </summary>
      {open ? (
        <div className="border-t border-zinc-200 px-4 py-1 dark:border-zinc-800">
          <RunLines lines={run.lines} />
        </div>
      ) : null}
    </details>
  );
}
