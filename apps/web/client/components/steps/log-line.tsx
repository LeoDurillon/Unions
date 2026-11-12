// One line of an agent log: a tool call's row, the agent's words as prose, a run's end or error.
// Also a run's total use, for its header, and what a Log with no line shows.

import type { ReactElement } from 'react';

import type { LogLine, ToolCallPart } from '../../lib/log/agent-events';
import type { LogRun } from '../../lib/log/log-runs';
import { sumTokens, tokensText, type CallTokens } from '../../lib/log/token-counts';
import { Loading, SkeletonLog } from '../ui/skeleton';
import { LineTime, ToolRow } from './log-tool-row';

export type Entry = {
  key: string;
  kind: LogLine['kind'] | 'run';
  text: string;
  tokens?: CallTokens;
  /** When it was logged. */
  at?: number;
  call?: ToolCallPart;
  model?: string;
  /** On a ticket run's header: the run, to tell whether it still runs. */
  runId?: number;
};

/** The agent's own words: a row of prose with its time. */
function AgentWords({ entry }: { entry: Entry }): ReactElement {
  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 bg-zinc-50/70 py-2 last:border-b-0 dark:border-zinc-800/60 dark:bg-zinc-950/40">
      <span className="w-16 shrink-0 rounded-md bg-indigo-50 text-center text-[11px] leading-5 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
        Agent
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
        {entry.text}
      </p>
      <LineTime at={entry.at} />
    </div>
  );
}

const LINES: Record<Entry['kind'], (entry: Entry) => ReactElement | null> = {
  run: ({ text }) => <p className="text-sm font-semibold">{text}</p>,
  tool: ({ text, call, at }) => <ToolRow text={text} call={call} at={at} />,
  // A result shows on its call's row; one without its call says nothing the next line does not.
  tool_result: () => null,
  text: (entry) => <AgentWords entry={entry} />,
  init: ({ text }) => <p className="py-1 text-xs text-zinc-500">{text}</p>,
  result: ({ text }) => (
    <p className="py-1 text-xs font-medium text-green-700 dark:text-green-400">✓ {text}</p>
  ),
  error: ({ text }) => (
    <p className="my-1 rounded-lg bg-red-50 px-3 py-1.5 font-mono text-xs whitespace-pre-wrap text-red-700 dark:bg-red-950/40 dark:text-red-400">
      {text}
    </p>
  ),
};

/** One line of the log, shaped by its kind; a tool's plain result is not shown. */
export function Line({ entry }: { entry: Entry }): ReactElement | null {
  return LINES[entry.kind](entry);
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
