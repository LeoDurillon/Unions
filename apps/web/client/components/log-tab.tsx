import { STEPS } from '@union/core/states';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import type { EventRow } from '../../src/api-types';
import { summarizeAgentEvent, type LogLine } from '../lib/agent-events';
import { api } from '../lib/api';
import { subscribe } from '../lib/event-hub';
import { STEP_TITLES } from '../lib/labels';
import { groupRuns, type LogRun } from '../lib/log-runs';

type Entry = { key: string; kind: LogLine['kind'] | 'run'; text: string };

const KIND_CLASS: Record<Entry['kind'], string> = {
  run: 'font-semibold',
  init: 'text-zinc-500',
  text: '',
  tool: 'text-indigo-600 dark:text-indigo-400',
  tool_result: 'text-zinc-500',
  result: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
};

function stepTitle(payload: unknown): string {
  const step =
    typeof payload === 'object' && payload !== null && 'step' in payload ? payload.step : null;
  const known = STEPS.find((candidate) => candidate === step);
  return known ? STEP_TITLES[known] : '';
}

/** The review agent's runs on the ticket: a header when it starts, a line when it ends. */
function agentReviewEntries(event: EventRow): Entry[] {
  const payload = typeof event.payload === 'object' && event.payload !== null ? event.payload : {};
  const status = 'status' in payload ? payload.status : null;
  const key = `${event.seq}`;
  if (status === 'running') {
    return [{ key, kind: 'run', text: 'Review comments · agent review' }];
  }
  if (status === 'succeeded') {
    const count = 'comments' in payload ? Number(payload.comments) : 0;
    return [
      { key, kind: 'result', text: `${count} suggestion${count === 1 ? '' : 's'} added as drafts` },
    ];
  }
  if (status === 'failed') {
    const error = 'error' in payload ? String(payload.error) : '';
    return [{ key, kind: 'error', text: `Agent review failed: ${error}` }];
  }
  return [];
}

function entriesFor(event: EventRow): Entry[] {
  if (event.type === 'agent_review_changed') {
    return agentReviewEntries(event);
  }
  if (event.type === 'run_started') {
    const text = `Run #${event.runId ?? '?'} · ${stepTitle(event.payload)}`;
    return [{ key: `${event.seq}`, kind: 'run', text }];
  }
  if (event.type === 'investigation_started') {
    const time = new Date(event.at).toLocaleString();
    return [{ key: `${event.seq}`, kind: 'run', text: `Run started ${time}` }];
  }
  if (event.type !== 'agent_event') {
    return [];
  }
  return summarizeAgentEvent(event.payload).map((line, index) => ({
    key: `${event.seq}-${index}`,
    kind: line.kind,
    text: line.text,
  }));
}

/** Whose log: a ticket's or an investigation's. */
export type LogSource = { ticket: number } | { investigation: number };

function queryOf(source: LogSource): string {
  return 'ticket' in source ? `ticket=${source.ticket}` : `investigation=${source.investigation}`;
}

function belongs(event: EventRow, source: LogSource): boolean {
  return 'ticket' in source
    ? event.ticketId === source.ticket
    : event.investigationId === source.investigation;
}

/**
 * The log's history, loaded once, then its new events from the shared stream. Events arriving while
 * the history loads are kept and added after it, without repeats.
 */
function useLogEntries(source: LogSource): { entries: Entry[]; error: Error | null } {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [failure, setFailure] = useState<Error | null>(null);
  const query = queryOf(source);
  useEffect(() => {
    let lastSeq: number | null = null;
    const early: EventRow[] = [];
    const unsubscribe = subscribe((event) => {
      if (!belongs(event, source)) {
        return;
      }
      if (lastSeq === null) {
        early.push(event);
      } else if (event.seq > lastSeq) {
        lastSeq = event.seq;
        setEntries((previous) => [...previous, ...entriesFor(event)]);
      }
    });
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const rows = await api.eventHistory(query);
        if (cancelled) {
          return;
        }
        const known = rows.at(-1)?.seq ?? 0;
        const all = [...rows, ...early.filter((event) => event.seq > known)];
        lastSeq = all.at(-1)?.seq ?? 0;
        setEntries(all.flatMap((event) => entriesFor(event)));
      } catch (error) {
        setFailure(error instanceof Error ? error : new Error(String(error)));
      }
    };
    void load();
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `query` identifies the source.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return { entries, error: failure };
}

function Line({ entry }: { entry: Entry }): ReactElement {
  return <p className={`whitespace-pre-wrap ${KIND_CLASS[entry.kind]}`}>{entry.text}</p>;
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
  return (
    <details
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
      className="border-t border-zinc-300 pt-2 first:border-t-0 first:pt-0 dark:border-zinc-700"
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-2">
        <span aria-hidden className="w-3 text-center text-zinc-500">
          {open ? '▾' : '▸'}
        </span>
        {run.header ? (
          <Line entry={run.header} />
        ) : (
          <p className="font-semibold">Before the runs</p>
        )}
        <span className="text-zinc-500">
          {run.lines.length} line{run.lines.length === 1 ? '' : 's'}
        </span>
      </summary>
      {open ? (
        <div className="mt-1 space-y-1">
          {run.lines.map((entry) => (
            <Line key={entry.key} entry={entry} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

/** Replays a whole agent log, then follows it live; every run but the last starts folded. */
export function AgentLog({ source }: { source: LogSource }): ReactElement {
  const { entries, error } = useLogEntries(source);
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
