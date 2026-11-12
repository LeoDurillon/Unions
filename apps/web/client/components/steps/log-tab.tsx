// Replays the ticket's whole agent log, then follows it live.

import type { CustomAgentNames, LogEntry } from '@union/core';
import { isEvent, type EventPayloads } from '@union/core/event-catalog';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { stepTitle } from '../../lib/board/labels';
import { summarizeAgentEvent, type LogLine } from '../../lib/log/agent-events';
import { groupRuns, type LogRun } from '../../lib/log/log-runs';
import { sumTokens, tokensText, type CallTokens } from '../../lib/log/token-counts';
import { useLog } from '../../lib/log/use-log';
import { formatWhen } from '../../lib/ui/relative-time';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';

type Entry = { key: string; kind: LogLine['kind'] | 'run'; text: string; tokens?: CallTokens };

const KIND_CLASS: Record<Entry['kind'], string> = {
  run: 'font-semibold',
  init: 'text-zinc-500',
  text: '',
  tool: 'text-indigo-600 dark:text-indigo-400',
  tool_result: 'text-zinc-500',
  result: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
};

type AgentReviewChange = EventPayloads['agent_review_changed'];

/** The review agent's runs on the ticket: a header when it starts, a line when it ends. */
function agentReviewEntries(key: string, { status, comments, error }: AgentReviewChange): Entry[] {
  if (status === 'running') {
    return [{ key, kind: 'run', text: 'Review comments · agent review' }];
  }
  if (status === 'succeeded') {
    const count = comments ?? 0;
    return [
      { key, kind: 'result', text: `${count} suggestion${count === 1 ? '' : 's'} added as drafts` },
    ];
  }
  if (status === 'failed') {
    return [{ key, kind: 'error', text: `Agent review failed: ${error ?? ''}` }];
  }
  return [];
}

/** An event rule applied to the ticket: what it set, or why not. */
function ruleEntries(
  key: string,
  { status, detail, error }: EventPayloads['event_rule_applied'],
): Entry[] {
  const text = `Event rule ${status}${detail ? `: ${detail}` : ''}${error ? ` (${error})` : ''}`;
  return [{ key, kind: status === 'failed' ? 'error' : 'result', text }];
}

function entriesFor(entry: LogEntry, names: CustomAgentNames): Entry[] {
  if (entry.source === 'agent') {
    return summarizeAgentEvent(entry.line.payload).map((line, index) =>
      Object.assign(line, { key: `line-${entry.line.id}-${index}` }),
    );
  }
  const { event } = entry;
  const key = `${event.seq}`;
  if (
    isEvent(event, 'preview_idle_stopped') ||
    isEvent(event, 'preview_reset') ||
    isEvent(event, 'preview_services_stopped') ||
    isEvent(event, 'ticket_workspace_removed')
  ) {
    return [{ key, kind: 'result', text: event.payload.message }];
  }
  if (isEvent(event, 'event_rule_applied')) {
    return ruleEntries(key, event.payload);
  }
  if (isEvent(event, 'agent_review_changed')) {
    return agentReviewEntries(key, event.payload);
  }
  if (isEvent(event, 'run_started')) {
    const text = `Run #${event.runId ?? '?'} · ${stepTitle(event.payload.step, names)}`;
    return [{ key, kind: 'run', text }];
  }
  if (isEvent(event, 'investigation_started')) {
    const time = formatWhen(event.at);
    return [{ key, kind: 'run', text: `Run started ${time}` }];
  }
  return [];
}

/** Whose log: a ticket's or an investigation's. */
export type LogSource = { ticket: number } | { investigation: number };

function queryOf(source: LogSource): string {
  return 'ticket' in source ? `ticket=${source.ticket}` : `investigation=${source.investigation}`;
}

function Line({ entry }: { entry: Entry }): ReactElement {
  return <p className={`whitespace-pre-wrap ${KIND_CLASS[entry.kind]}`}>{entry.text}</p>;
}

/** What the run's agent calls used, summed: `2 calls · 12 turns · 4.1M in…`. */
function runTotal(run: LogRun<Entry>): string {
  const calls = run.lines.flatMap((entry) => (entry.tokens ? [entry.tokens] : []));
  const used = tokensText(sumTokens(calls));
  if (calls.length < 2) {
    return used;
  }
  return `${calls.length} calls${used ? ` · ${used}` : ''}`;
}

/** The lines a long run shows at first: its end, where it stands now; the rest on a click. */
const SHOWN_LINES = 500;

/** A run's lines: the last 500 of a long one, with a button for the earlier ones. */
function RunLines({ lines }: { lines: LogRun<Entry>['lines'] }): ReactElement {
  const [all, setAll] = useState(false);
  const hidden = all ? 0 : Math.max(0, lines.length - SHOWN_LINES);
  return (
    <div className="mt-1 space-y-1">
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

/** One run, folded unless it is the last one or the user opened it. */
function RunSection({
  run,
  open,
  onToggle,
}: {
  run: LogRun<Entry>;
  open: boolean;
  onToggle: (open: boolean) => void;
}): ReactElement {
  const total = runTotal(run);
  return (
    <details
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
      className="border-t border-zinc-300 pt-2 first:border-t-0 first:pt-0 dark:border-zinc-700"
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-2">
        <span aria-hidden className="w-3 shrink-0 text-center text-zinc-500">
          {open ? '▾' : '▸'}
        </span>
        <span className="min-w-0">
          {run.header ? (
            <Line entry={run.header} />
          ) : (
            <p className="font-semibold">Before the runs</p>
          )}
          {/* The run's size and usage on a line of their own, so a long header does not wrap them. */}
          <span className="block text-zinc-500">
            {run.lines.length} line{run.lines.length === 1 ? '' : 's'}
            {total ? ` · ${total}` : ''}
          </span>
        </span>
      </summary>
      {open ? <RunLines lines={run.lines} /> : null}
    </details>
  );
}

/** Replays a whole agent log, then follows it live; every run but the last starts folded. */
export function AgentLog({ source }: { source: LogSource }): ReactElement {
  const log = useLog(queryOf(source));
  const names = useCustomAgentNames();
  const entries = useMemo(
    () => log.entries.flatMap((entry) => entriesFor(entry, names)),
    [log.entries, names],
  );
  const { error } = log;
  // The runs the user opened or folded; the others follow the default.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const runs = groupRuns(entries, (entry) => entry.kind === 'run');
  const lastKey = runs.at(-1)?.key;
  // Follows new lines only: opening or folding a run keeps the reader where they are.
  const end = useRef<HTMLDivElement>(null);
  const count = entries.length;
  useEffect(() => {
    if (count > 0) {
      end.current?.scrollIntoView({ block: 'end' });
    }
  }, [count]);

  return (
    <div className="space-y-3 font-mono text-xs">
      {error ? <p className="text-red-600 dark:text-red-400">{error.message}</p> : null}
      {entries.length === 0 && !error ? (
        <p className="text-zinc-500">No agent activity yet.</p>
      ) : null}
      {runs.map((run) => {
        const open = toggled.get(run.key) ?? run.key === lastKey;
        return (
          <RunSection
            key={run.key}
            run={run}
            open={open}
            onToggle={(next) => {
              if (next !== open) {
                setToggled((current) => new Map(current).set(run.key, next));
              }
            }}
          />
        );
      })}
      <div ref={end} />
    </div>
  );
}

/** Replays the ticket's whole agent log, then follows it live. */
export function LogTab({ ticketId }: { ticketId: number }): ReactElement {
  return <AgentLog source={{ ticket: ticketId }} />;
}
