import { STEPS } from '@union/core/states';
import { useEffect, useState, type ReactElement } from 'react';

import type { EventRow } from '../../src/api-types';
import { summarizeAgentEvent, type LogLine } from '../lib/agent-events';
import { api } from '../lib/api';
import { subscribe } from '../lib/event-hub';
import { STEP_TITLES } from '../lib/labels';

type Entry = { key: string; kind: LogLine['kind'] | 'run'; text: string };

const KIND_CLASS: Record<Entry['kind'], string> = {
  run: 'mt-3 border-t border-zinc-300 pt-2 font-semibold dark:border-zinc-700',
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

function entriesFor(event: EventRow): Entry[] {
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

/** Replays a whole agent log, then follows it live. */
export function AgentLog({ source }: { source: LogSource }): ReactElement {
  const { entries, error } = useLogEntries(source);

  return (
    <div className="space-y-1 font-mono text-xs">
      {error ? <p className="text-red-600 dark:text-red-400">{error.message}</p> : null}
      {entries.length === 0 && !error ? (
        <p className="text-zinc-500">No agent activity yet.</p>
      ) : null}
      {entries.map((entry) => (
        <p key={entry.key} className={`whitespace-pre-wrap ${KIND_CLASS[entry.kind]}`}>
          {entry.text}
        </p>
      ))}
      <div
        ref={(node) => {
          node?.scrollIntoView({ block: 'end' });
        }}
      />
    </div>
  );
}

/** Replays the ticket's whole agent log, then follows it live. */
export function LogTab({ ticketId }: { ticketId: number }): ReactElement {
  return <AgentLog source={{ ticket: ticketId }} />;
}
