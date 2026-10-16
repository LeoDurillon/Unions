// Tests the agent log: where each line falls among the events, and reading a Log page by page.
import { beforeEach, expect, test } from 'bun:test';

import { appendAgentLine, readLog, type LogEntry } from './agent-log';
import { createDb, migrateDb, type Db } from './db';
import { emitEvent } from './tickets';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function describe(entries: LogEntry[]): string[] {
  return entries.map((entry) =>
    entry.source === 'event' ? entry.event.type : String(entry.line.payload),
  );
}

test('each agent line is read after the event it was written after, before the next', () => {
  appendAgentLine(db, { ticketId: 1, payload: 'before any run' });
  emitEvent(db, { type: 'run_started', ticketId: 1, runId: 1, payload: { step: 'intake' } });
  appendAgentLine(db, { ticketId: 1, runId: 1, payload: 'first' });
  emitEvent(db, { type: 'ticket_updated_from_github', ticketId: 2, payload: {} });
  appendAgentLine(db, { ticketId: 1, runId: 1, payload: 'second' });
  emitEvent(db, {
    type: 'run_finished',
    ticketId: 1,
    runId: 1,
    payload: { step: 'intake', status: 'succeeded' },
  });

  const { entries } = readLog(db, { ticketId: 1 }, { seq: 0, line: 0 });
  expect(describe(entries)).toEqual([
    'before any run',
    'run_started',
    'first',
    'second',
    'run_finished',
  ]);
});

test('reading from the cursor returns only what came after, from both tables', () => {
  emitEvent(db, { type: 'run_started', ticketId: 1, runId: 1, payload: { step: 'intake' } });
  appendAgentLine(db, { ticketId: 1, runId: 1, payload: 'first' });
  const first = readLog(db, { ticketId: 1 }, { seq: 0, line: 0 });

  appendAgentLine(db, { ticketId: 1, runId: 1, payload: 'second' });
  emitEvent(db, { type: 'step_output', ticketId: 1, payload: { step: 'intake', version: 1 } });
  const next = readLog(db, { ticketId: 1 }, first.cursor);
  expect(describe(next.entries)).toEqual(['second', 'step_output']);
  expect(readLog(db, { ticketId: 1 }, next.cursor).entries).toEqual([]);
});

test("an investigation's Log holds its own lines only", () => {
  appendAgentLine(db, { investigationId: 3, payload: 'mine' });
  appendAgentLine(db, { ticketId: 3, payload: 'a ticket' });
  emitEvent(db, { type: 'investigation_started', investigationId: 3, payload: {} });
  const { entries } = readLog(db, { investigationId: 3 }, { seq: 0, line: 0 });
  expect(describe(entries)).toEqual(['mine', 'investigation_started']);
});
