// Tests for the record of a project's shared services.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import { schema } from './index';
import { getSharedStack, saveSharedStack } from './shared-stacks';

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

const RUNNING = {
  services: [{ service: 'clamav', running: true }],
  previews: ['t33', 'r5'],
  agents: [],
  urls: [],
  error: null,
};

test('a running stack keeps the time it started; a stopped one has none', () => {
  saveSharedStack(db, projectId, RUNNING, 1000);
  saveSharedStack(db, projectId, { ...RUNNING, previews: ['t33'] }, 2000);
  expect(getSharedStack(db, projectId)).toMatchObject({
    status: 'running',
    previews: ['t33'],
    startedAt: 1000,
    updatedAt: 2000,
  });
  saveSharedStack(db, projectId, { ...RUNNING, services: [], previews: [] }, 3000);
  expect(getSharedStack(db, projectId)).toMatchObject({ status: 'stopped', startedAt: null });
});

test('a failed start says why', () => {
  saveSharedStack(db, projectId, { ...RUNNING, services: [], error: 'clamav did not start' });
  expect(getSharedStack(db, projectId)).toMatchObject({
    status: 'failed',
    error: 'clamav did not start',
  });
  expect(getSharedStack(db, projectId + 1)).toBeNull();
});
