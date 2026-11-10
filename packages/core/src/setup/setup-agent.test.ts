// Tests queuing the setup agent and reading a project's latest setup run with its proposal.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import { finishInvestigation, InvestigationError } from '../investigations';
import * as schema from '../tables';
import { latestSetup, queueSetup } from './setup-agent';

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

test('queues a read-only repository run of kind setup, on Sonnet by default', () => {
  const run = queueSetup(db, projectId);
  expect(run).toMatchObject({
    kind: 'setup',
    scope: 'repository',
    model: 'sonnet',
    status: 'queued',
  });
  expect(run.tools).toEqual(['Read', 'Grep', 'Glob']);
  expect(run.title).toBe('Set up o/r');
  expect(run.prompt).toContain('```json');
  expect(run.prompt).toContain('/workspace/union-guide');
});

test('takes the model the user chose, and refuses an unknown one', () => {
  expect(queueSetup(db, projectId, 'opus').model).toBe('opus');
  finishInvestigation(db, latestSetup(db, projectId)?.investigation.id ?? 0, {
    status: 'cancelled',
  });
  expect(() => queueSetup(db, projectId, 'gpt')).toThrow(InvestigationError);
});

test('refuses a second run while one waits', () => {
  queueSetup(db, projectId);
  expect(() => queueSetup(db, projectId)).toThrow('has not finished yet');
});

test('refuses a project that does not exist', () => {
  expect(() => queueSetup(db, 999)).toThrow('not found');
});

test('reads the latest run, with its proposal once answered', () => {
  expect(latestSetup(db, projectId)).toBeNull();
  const run = queueSetup(db, projectId);
  expect(latestSetup(db, projectId)).toMatchObject({ proposal: null });
  const answer =
    'Found it.\n\n```json\n{"summary":"A Bun app","checks":{"gateCommand":"bun test"}}\n```';
  finishInvestigation(db, run.id, { status: 'succeeded', result: answer });
  expect(latestSetup(db, projectId)?.proposal).toMatchObject({
    summary: 'A Bun app',
    checks: { installCommand: '', gateCommand: 'bun test' },
  });
});
