// Tests recording usage from the agent log: live through `appendAgentLine`, and replayed by the backfill.
import { beforeEach, expect, test } from 'bun:test';

import { appendAgentLine } from './agent-log';
import { backfillUsage } from './agent-usage-record';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './tables';

const OPUS = 'claude-opus-5-5';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function turn(id: string, context: number, session = 's1'): unknown {
  return {
    type: 'assistant',
    session_id: session,
    parent_tool_use_id: null,
    message: { id, model: OPUS, usage: { input_tokens: context } },
  };
}

function result(output: number, cost: number, session = 's1'): unknown {
  return {
    type: 'result',
    is_error: false,
    session_id: session,
    num_turns: 2,
    usage: { output_tokens: output },
    modelUsage: { [OPUS]: { outputTokens: output, costUSD: cost } },
  };
}

function rows(): (typeof schema.agentUsage.$inferSelect)[] {
  return db.select().from(schema.agentUsage).all();
}

test('a result records its call, with the peak context of its own turns', () => {
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: turn('m1', 100) });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: turn('m2', 300) });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: result(50, 1.25) });
  expect(rows()).toMatchObject([
    {
      ticketId: 1,
      runId: 7,
      model: OPUS,
      main: true,
      output: 50,
      costMicroUsd: 1_250_000,
      turns: 2,
      peakContext: 300,
    },
  ]);
});

test('a resumed session records each call’s share, from its own turns', () => {
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: turn('m1', 900) });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: result(50, 1) });
  appendAgentLine(db, { ticketId: 1, runId: 8, payload: turn('m2', 200) });
  appendAgentLine(db, { ticketId: 1, runId: 8, payload: result(80, 1.5) });
  expect(rows().map((row) => [row.runId, row.output, row.costMicroUsd, row.peakContext])).toEqual([
    [7, 50, 1_000_000, 900],
    [8, 30, 500_000, 200],
  ]);
});

test('another session or another ticket is not the previous call', () => {
  appendAgentLine(db, { ticketId: 2, payload: result(50, 1) });
  appendAgentLine(db, { ticketId: 1, payload: result(10, 0.5, 's2') });
  appendAgentLine(db, { ticketId: 1, payload: result(80, 1.5) });
  expect(rows().map((row) => row.output)).toEqual([50, 10, 80]);
});

test('an investigation’s calls are recorded under it', () => {
  appendAgentLine(db, { investigationId: 3, payload: result(40, 0.2) });
  expect(rows()[0]).toMatchObject({ investigationId: 3, ticketId: null, output: 40 });
});

test('the backfill records the calls not recorded yet, once', () => {
  appendAgentLine(db, { ticketId: 1, payload: result(50, 1) });
  db.delete(schema.agentUsage).run();
  appendAgentLine(db, { ticketId: 1, payload: result(80, 1.5) });
  expect(backfillUsage(db)).toEqual({ read: 1, recorded: 1 });
  expect(backfillUsage(db)).toEqual({ read: 0, recorded: 0 });
  expect(
    rows()
      .map((row) => row.output)
      .toSorted((a, b) => a - b),
  ).toEqual([30, 50]);
});
