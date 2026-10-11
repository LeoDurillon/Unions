import { STEPS } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { EventRow } from '../../src/api-types';
import { summarizeAgentEvent, type LogLine } from '../lib/agent-events';
import { STEP_TITLES } from '../lib/labels';
import { useEventStream } from '../lib/use-event-stream';

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
  if (event.type !== 'agent_event') {
    return [];
  }
  return summarizeAgentEvent(event.payload).map((line, index) => ({
    key: `${event.seq}-${index}`,
    kind: line.kind,
    text: line.text,
  }));
}

/** Replays the ticket's whole agent log, then follows it live. */
export function LogTab({ ticketId }: { ticketId: number }): ReactElement {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEventStream(`/api/events?ticket=${ticketId}&after=0`, (event) => {
    const added = entriesFor(event);
    if (added.length > 0) {
      setEntries((previous) => [...previous, ...added]);
    }
  });

  return (
    <div className="space-y-1 font-mono text-xs">
      {entries.length === 0 ? <p className="text-zinc-500">No agent activity yet.</p> : null}
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
