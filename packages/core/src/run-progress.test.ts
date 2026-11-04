import { beforeEach, expect, test } from 'bun:test';

import { latestActivity } from './agent-activity';
import { appendAgentLine } from './agent-log';
import { createDb, migrateDb, type Db } from './db';
import { projectRunProgress } from './run-progress';
import * as schema from './tables';
import { createTicket } from './tickets';

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function startRun(ticketId: number, status: 'running' | 'succeeded' = 'running'): number {
  return db
    .insert(schema.runs)
    .values({ ticketId, step: 'implement', model: 'sonnet', status, startedAt: 1000 })
    .returning()
    .get().id;
}

function said(ticketId: number, runId: number, content: unknown[]): void {
  appendAgentLine(db, { ticketId, runId, payload: { type: 'assistant', message: { content } } });
}

test('latestActivity: the last tool call or text of an assistant message', () => {
  expect(
    latestActivity({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Now the tests' },
          { type: 'tool_use', name: 'Bash', input: { command: 'bun test' } },
        ],
      },
    }),
  ).toEqual({ kind: 'tool', text: 'Bash bun test' });
  expect(latestActivity({ type: 'user', message: { content: [] } })).toBeNull();
  expect(
    latestActivity({ type: 'assistant', message: { content: [{ type: 'thinking' }] } }),
  ).toBeNull();
});

test("a running run's latest assistant line, skipping tool results and thinking", () => {
  const ticketId = createTicket(db, { projectId, title: 'T' }).id;
  const runId = startRun(ticketId);
  said(ticketId, runId, [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }]);
  said(ticketId, runId, [{ type: 'thinking', thinking: 'hmm' }]);
  appendAgentLine(db, {
    ticketId,
    runId,
    payload: { type: 'user', message: { content: [{ type: 'tool_result' }] } },
  });

  const [progress] = projectRunProgress(db, projectId);
  expect(progress).toMatchObject({
    ticketId,
    step: 'implement',
    startedAt: 1000,
    latest: { kind: 'tool', text: 'Read a.ts' },
  });
  expect(typeof progress?.latest?.at).toBe('number');
});

test('only running runs of the project, the newest per ticket; none before the first line', () => {
  const ticketId = createTicket(db, { projectId, title: 'T' }).id;
  const done = startRun(ticketId, 'succeeded');
  said(ticketId, done, [{ type: 'text', text: 'old run' }]);
  startRun(ticketId);
  const other = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'other', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  startRun(createTicket(db, { projectId: other, title: 'Elsewhere' }).id);

  expect(projectRunProgress(db, projectId)).toEqual([
    { ticketId, step: 'implement', startedAt: 1000, latest: null },
  ]);
});
