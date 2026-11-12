// The Log's raw output: each line the agent's CLI printed, as JSON, with a line where each run starts.

import type { LogEntry } from '@union/core';
import { isEvent } from '@union/core/event-catalog';
import { useState, type ReactElement } from 'react';

import { Button } from '../ui/ui';

/** A long log shows its end; the rest on a click. */
const SHOWN = 2000;

/** One line per agent line, as the CLI printed it; a marker where a run starts. */
export function rawLines(entries: readonly LogEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.source === 'agent') {
      return [JSON.stringify(entry.line.payload)];
    }
    if (isEvent(entry.event, 'run_started')) {
      return [`── Run #${entry.event.runId ?? '?'} · ${entry.event.payload.step} ──`];
    }
    return isEvent(entry.event, 'investigation_started') ? ['── Run ──'] : [];
  });
}

export function RawLog({ entries }: { entries: readonly LogEntry[] }): ReactElement {
  const [all, setAll] = useState(false);
  const lines = rawLines(entries);
  const hidden = all ? 0 : Math.max(0, lines.length - SHOWN);
  return (
    <div className="space-y-2">
      {hidden > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setAll(true);
          }}
        >
          Show the {hidden} earlier lines
        </Button>
      ) : null}
      <pre className="overflow-x-auto rounded-xl bg-zinc-950 px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-zinc-200">
        {lines.length > 0 ? lines.slice(hidden).join('\n') : 'Nothing yet.'}
      </pre>
    </div>
  );
}
