// Tests recording a call's tool uses from the agent log: live through `appendAgentLine`, and replayed by the backfill.

import { beforeEach, expect, test } from 'bun:test';

import { appendAgentLine } from '../agent/agent-log';
import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import { backfillToolUsage } from './agent-tool-record';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function use(id: string, command: string, session = 's1'): unknown {
  return {
    type: 'assistant',
    session_id: session,
    message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
  };
}

function output(id: string, text: string, session = 's1'): unknown {
  return {
    type: 'user',
    session_id: session,
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
  };
}

function result(session = 's1'): unknown {
  return { type: 'result', is_error: false, session_id: session, modelUsage: {} };
}

function rows(): { target: string; calls: number; resultBytes: number; resultLineId: number }[] {
  return db
    .select({
      target: schema.agentToolUsage.target,
      calls: schema.agentToolUsage.calls,
      resultBytes: schema.agentToolUsage.resultBytes,
      resultLineId: schema.agentToolUsage.resultLineId,
    })
    .from(schema.agentToolUsage)
    .all();
}

test('each call records only its own tool uses, since the session’s previous result', () => {
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: use('a', 'git diff main...HEAD') });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: output('a', 'diff') });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: use('x', 'ls', 'other') });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: result() });
  appendAgentLine(db, { ticketId: 1, runId: 8, payload: use('b', 'git log') });
  appendAgentLine(db, { ticketId: 1, runId: 8, payload: result() });
  expect(rows()).toEqual([
    { target: 'git diff', calls: 1, resultBytes: 4, resultLineId: 4 },
    { target: 'git log', calls: 1, resultBytes: 0, resultLineId: 6 },
  ]);
});

test('the backfill records past calls once', () => {
  appendAgentLine(db, { ticketId: 1, payload: use('a', 'git status') });
  appendAgentLine(db, { ticketId: 1, payload: result() });
  db.delete(schema.agentToolUsage).run();
  expect(backfillToolUsage(db)).toEqual({ read: 1, recorded: 1 });
  expect(backfillToolUsage(db)).toEqual({ read: 0, recorded: 0 });
  expect(rows()).toHaveLength(1);
});

test('a pull request’s agent review records its tool uses under it', () => {
  appendAgentLine(db, { agentReviewId: 4, payload: use('a', 'git diff main...HEAD') });
  appendAgentLine(db, { agentReviewId: 4, payload: output('a', 'diff') });
  appendAgentLine(db, { agentReviewId: 4, payload: result() });
  const [row] = db.select().from(schema.agentToolUsage).all();
  expect(row).toMatchObject({ agentReviewId: 4, ticketId: null, target: 'git diff', calls: 1 });
});
