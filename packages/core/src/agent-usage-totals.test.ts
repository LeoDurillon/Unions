// Tests the Usage tables' data: calls by run, side runs apart, an investigation by call, and the sums.
import { beforeEach, expect, test } from 'bun:test';

import { appendAgentLine } from './agent-log';
import { usageOf } from './agent-usage-totals';
import { createDb, migrateDb, type Db } from './db';

const OPUS = 'claude-opus-5-5';
const HAIKU = 'claude-haiku-5-5';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function result(session: string, opus: number, haiku = 0): unknown {
  const models: Record<string, unknown> = { [OPUS]: { outputTokens: opus, costUSD: opus / 100 } };
  if (haiku > 0) {
    models[HAIKU] = { outputTokens: haiku, costUSD: haiku / 1000 };
  }
  return { type: 'result', is_error: false, session_id: session, num_turns: 3, modelUsage: models };
}

test('a ticket’s calls are grouped by run, its side runs together, and summed', () => {
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: result('s1', 100, 10) });
  appendAgentLine(db, { ticketId: 1, runId: 7, payload: result('s2', 50) });
  appendAgentLine(db, { ticketId: 1, payload: result('s3', 20) });
  appendAgentLine(db, { ticketId: 2, runId: 9, payload: result('s4', 999) });
  const view = usageOf(db, { ticketId: 1 });
  expect(view.groups.map((group) => [group.key, group.calls.length, group.total.output])).toEqual([
    ['run-7', 2, 160],
    ['side', 1, 20],
  ]);
  expect(view.groups[0]?.calls[0]?.models.map((model) => [model.model, model.main])).toEqual([
    [OPUS, true],
    [HAIKU, false],
  ]);
  expect(view.total).toMatchObject({ calls: 3, turns: 9, output: 180 });
  expect(view.total.costUsd).toBeCloseTo(1.71);
});

test('an investigation shows one group per call', () => {
  appendAgentLine(db, { investigationId: 4, payload: result('s1', 10) });
  appendAgentLine(db, { investigationId: 4, payload: result('s1', 30) });
  const view = usageOf(db, { investigationId: 4 });
  expect(view.groups.map((group) => group.total.output)).toEqual([10, 20]);
});

test('nothing recorded yet: no groups, and no cost', () => {
  expect(usageOf(db, { ticketId: 1 })).toMatchObject({
    groups: [],
    total: { calls: 0, costUsd: null },
  });
});
