// Replays a ticket's or an investigation's whole agent log, then follows it live: a card per run, or the raw output.

import type { LogEntry } from '@union/core';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { groupRuns, type LogRun } from '../../lib/log/log-runs';
import { useLog } from '../../lib/log/use-log';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { Segmented } from '../ui/choice';
import { finishedRuns, logEntries } from './log-entries';
import { NoEntries, type Entry } from './log-line';
import { RawLog } from './log-raw';
import { RunSection } from './log-run';

/** Whose log: a ticket's or an investigation's. */
export type LogSource = { ticket: number } | { investigation: number };

function queryOf(source: LogSource): string {
  return 'ticket' in source ? `ticket=${source.ticket}` : `investigation=${source.investigation}`;
}

type Mode = 'steps' | 'raw';

const MODES: { value: Mode; label: string }[] = [
  { value: 'steps', label: 'Steps' },
  { value: 'raw', label: 'Raw output' },
];

/** The runs as cards, the last one open; a run whose finish the Log has not seen pulses. */
function RunList({ runs, log }: { runs: LogRun<Entry>[]; log: readonly LogEntry[] }): ReactElement {
  // The runs the user opened or folded; the others follow the default.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const finished = finishedRuns(log);
  const lastKey = runs.at(-1)?.key;
  return (
    <>
      {runs.map((run) => {
        const open = toggled.get(run.key) ?? run.key === lastKey;
        const runId = run.header?.runId;
        return (
          <RunSection
            key={run.key}
            run={run}
            open={open}
            running={runId !== undefined && !finished.has(runId)}
            onToggle={(next) => {
              if (next !== open) {
                setToggled((current) => new Map(current).set(run.key, next));
              }
            }}
          />
        );
      })}
    </>
  );
}

/** Replays a whole agent log, then follows it live; every run but the last starts folded. */
export function AgentLog({ source }: { source: LogSource }): ReactElement {
  const log = useLog(queryOf(source));
  const names = useCustomAgentNames();
  const entries = useMemo(() => logEntries(log.entries, names), [log.entries, names]);
  const [mode, setMode] = useState<Mode>('steps');
  const runs = groupRuns(entries, (entry) => entry.kind === 'run');
  // Follows new lines only: opening or folding a run keeps the reader where they are.
  const end = useRef<HTMLDivElement>(null);
  const count = log.entries.length;
  useEffect(() => {
    if (count > 0) {
      end.current?.scrollIntoView({ block: 'end' });
    }
  }, [count]);
  return (
    <div className="space-y-3 text-xs">
      {count > 0 ? (
        <Segmented legend="Show the Log as" options={MODES} value={mode} onChange={setMode} />
      ) : null}
      {log.error ? <p className="text-red-600 dark:text-red-400">{log.error.message}</p> : null}
      {entries.length === 0 && !log.error ? <NoEntries loaded={log.loaded} /> : null}
      {mode === 'raw' ? (
        <RawLog entries={log.entries} />
      ) : (
        <RunList runs={runs} log={log.entries} />
      )}
      <div ref={end} />
    </div>
  );
}

/** Replays the ticket's whole agent log, then follows it live. */
export function LogTab({ ticketId }: { ticketId: number }): ReactElement {
  return <AgentLog source={{ ticket: ticketId }} />;
}
