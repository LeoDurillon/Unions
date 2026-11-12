// One line of an agent log: a tool call as its name and argument, the agent's words as prose, a run's end or error.
// Also a run's total use, for its header, and what a Log with no line shows.

import type { ReactElement } from 'react';

import type { LogLine } from '../../lib/log/agent-events';
import type { LogRun } from '../../lib/log/log-runs';
import { sumTokens, tokensText, type CallTokens } from '../../lib/log/token-counts';
import { Loading, SkeletonLog } from '../ui/skeleton';

export type Entry = {
  key: string;
  kind: LogLine['kind'] | 'run';
  text: string;
  tokens?: CallTokens;
};

/** A tool call: its name as a chip, then its argument on one line (the whole of it on hover). */
function ToolCall({ text }: { text: string }): ReactElement {
  const space = text.indexOf(' ');
  const name = space === -1 ? text : text.slice(0, space);
  const argument = space === -1 ? '' : text.slice(space + 1);
  return (
    <p className="flex min-w-0 items-baseline gap-2 py-0.5" title={text}>
      <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {name}
      </span>
      <span className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
        {argument}
      </span>
    </p>
  );
}

const LINES: Record<Entry['kind'], (text: string) => ReactElement | null> = {
  run: (text) => <p className="text-sm font-semibold">{text}</p>,
  tool: (text) => <ToolCall text={text} />,
  // "tool result" says nothing the next line does not.
  tool_result: () => null,
  text: (text) => (
    <p className="my-1 rounded-lg border-l-2 border-indigo-300 bg-indigo-50/60 px-3 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-zinc-200">
      {text}
    </p>
  ),
  init: (text) => <p className="py-0.5 text-xs text-zinc-500">{text}</p>,
  result: (text) => (
    <p className="py-0.5 text-xs font-medium text-green-700 dark:text-green-400">✓ {text}</p>
  ),
  error: (text) => (
    <p className="my-1 rounded-lg bg-red-50 px-3 py-1.5 font-mono text-xs whitespace-pre-wrap text-red-700 dark:bg-red-950/40 dark:text-red-400">
      {text}
    </p>
  ),
};

/** One line of the log, shaped by its kind; a tool's plain result is not shown. */
export function Line({ entry }: { entry: Entry }): ReactElement | null {
  return LINES[entry.kind](entry.text);
}

/** What the run's agent calls used, summed: `2 calls · 12 turns · 4.1M in…`. */
export function runTotal(run: LogRun<Entry>): string {
  const calls = run.lines.flatMap((entry) => (entry.tokens ? [entry.tokens] : []));
  const used = tokensText(sumTokens(calls));
  if (calls.length < 2) {
    return used;
  }
  return `${calls.length} calls${used ? ` · ${used}` : ''}`;
}

/** Before the first read, the shape of a log; after it, that there is none yet. */
export function NoEntries({ loaded }: { loaded: boolean }): ReactElement {
  if (loaded) {
    return <p className="text-zinc-500">No agent activity yet.</p>;
  }
  return (
    <Loading
      label="Reading the Log"
      className="space-y-2.5 rounded-xl border border-zinc-200 px-4 py-3.5 dark:border-zinc-800"
    >
      <SkeletonLog count={8} />
    </Loading>
  );
}
