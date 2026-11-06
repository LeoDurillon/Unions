// Starting a step over: the run gets no revision and no session, even after a revision that failed.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  latestOutput,
  migrateDb,
  schema,
  type Db,
} from '@union/core';

import { drainCommands } from './commands';
import { Scheduler, type StepContext, type StepExecutor } from './scheduler';

let db: Db;
let ticketId: number;

function command(type: string, payload?: unknown): void {
  db.insert(schema.commands)
    .values({ type, ticketId, payload: payload ?? null })
    .run();
  drainCommands(db);
}

async function run(scheduler: Scheduler): Promise<void> {
  scheduler.tick();
  await scheduler.idle();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

test('start over after a failed revision runs fresh, with no feedback and no session', async () => {
  const seen: Pick<StepContext, 'revision' | 'resumeSessionId'>[] = [];
  const executor: StepExecutor = ({ revision, resumeSessionId }) => {
    seen.push({ revision, resumeSessionId });
    // The first run writes a version, the revision fails, the start over writes a new version.
    return Promise.resolve(
      seen.length === 2
        ? { kind: 'error', error: 'boom' }
        : { kind: 'ok', output: `v${seen.length}`, sessionId: `s${seen.length}` },
    );
  };
  const scheduler = new Scheduler(db, executor, 2);

  command('start');
  await run(scheduler);
  command('revise', { feedback: 'shorter' });
  await run(scheduler);
  expect(seen[1]).toEqual({
    revision: { previous: 'v1', feedback: 'shorter' },
    resumeSessionId: 's1',
  });
  expect(getTicket(db, ticketId).phase.kind).toBe('failed');

  command('start_over');
  await run(scheduler);
  expect(seen[2]).toEqual({ revision: null, resumeSessionId: null });
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'intake' });
  expect(latestOutput(db, ticketId, 'intake')?.content).toBe('v3');
});
