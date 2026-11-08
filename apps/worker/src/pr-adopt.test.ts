// A ticket imported from a pull request: `adopt_pull_request` waits for approval at implementation, then Approve and Revise run as usual.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';

import { NO_HOOKS } from './command-hooks';
import { drainCommands } from './commands';
import { Scheduler, type StepContext, type StepExecutor } from './scheduler';

let db: Db;
let ticketId: number;
let shown: number[];

function command(type: string, payload?: unknown): void {
  db.insert(schema.commands)
    .values({ type, ticketId, payload: payload ?? null })
    .run();
  drainCommands(db, {
    ...NO_HOOKS,
    showAdoptedPullRequest: (id) => {
      shown.push(id);
    },
  });
}

function scheduler(seen: Pick<StepContext, 'step' | 'revision' | 'resumeSessionId'>[]): Scheduler {
  const executor: StepExecutor = ({ step, revision, resumeSessionId }) => {
    seen.push({ step, revision, resumeSessionId });
    return Promise.resolve({ kind: 'ok', output: 'done' });
  };
  return new Scheduler(db, executor, 1);
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  shown = [];
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, {
    projectId: project.id,
    title: 't',
    flow: ['implement', 'final_review'],
  }).id;
  db.insert(schema.stepOutputs)
    .values({ ticketId, step: 'implement', version: 1, content: 'The PR description.' })
    .run();
  command('adopt_pull_request');
});

test('adopting waits for approval at implementation and shows the branch', () => {
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'implement' });
  expect(shown).toEqual([ticketId]);
});

test('Approve runs the final review', async () => {
  const seen: Pick<StepContext, 'step' | 'revision' | 'resumeSessionId'>[] = [];
  command('approve');
  const runs = scheduler(seen);
  runs.tick();
  await runs.idle();
  expect(seen.map(({ step }) => step)).toEqual(['final_review']);
});

test('Revise runs the implementer with the feedback and no session', async () => {
  const seen: Pick<StepContext, 'step' | 'revision' | 'resumeSessionId'>[] = [];
  command('revise', { feedback: 'Rename the helper' });
  const runs = scheduler(seen);
  runs.tick();
  await runs.idle();
  expect(seen).toHaveLength(1);
  expect(seen[0]?.step).toBe('implement');
  expect(seen[0]?.revision?.feedback).toBe('Rename the helper');
  expect(seen[0]?.resumeSessionId ?? null).toBeNull();
});
