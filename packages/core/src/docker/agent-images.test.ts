import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import {
  discardPendingAgentImage,
  finishAgentImage,
  markAgentImageBuilding,
  readAgentImage,
  saveAgentImage,
  SYNC_AGENT_IMAGE,
  unfinishedAgentImages,
  writeAgentImageOutput,
} from './agent-images';

let db: Db;
let projectId: number;
const DOCKERFILE = { kind: 'dockerfile', dockerfile: 'FROM union-agent\n' } as const;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function syncCommands(): number {
  return db
    .select()
    .from(schema.commands)
    .all()
    .filter((command) => command.type === SYNC_AGENT_IMAGE).length;
}

test('a save is pending and queued; applying it clears it', () => {
  const saved = saveAgentImage(db, projectId, DOCKERFILE);
  expect(saved.status).toBe('queued');
  expect(syncCommands()).toBe(1);
  expect(unfinishedAgentImages(db)).toHaveLength(1);
  expect(markAgentImageBuilding(db, projectId, saved.savedAt)).toBe(true);
  writeAgentImageOutput(db, projectId, saved.savedAt, ['step 1', 'step 2']);
  expect(readAgentImage(db, projectId)?.output).toBe('step 1\nstep 2');
  const applied = { ...DOCKERFILE, tag: 'union-agent-p1:abc', sizeBytes: 1, appliedAt: 2 };
  finishAgentImage(db, { projectId, savedAt: saved.savedAt }, { applied });
  const row = readAgentImage(db, projectId);
  expect(row?.status).toBe('idle');
  expect(row?.pending).toBeNull();
  expect(row?.applied).toEqual(applied);
  expect(unfinishedAgentImages(db)).toHaveLength(0);
});

test('a failure keeps the applied image and the save', () => {
  const saved = saveAgentImage(db, projectId, DOCKERFILE);
  finishAgentImage(db, { projectId, savedAt: saved.savedAt }, { error: 'no' });
  const row = readAgentImage(db, projectId);
  expect(row?.status).toBe('failed');
  expect(row?.pending).toEqual(DOCKERFILE);
  expect(row?.applied).toBeNull();
});

test('a newer save or a discard is never overwritten by the older build', async () => {
  const first = saveAgentImage(db, projectId, DOCKERFILE);
  await Bun.sleep(2);
  saveAgentImage(db, projectId, { kind: 'image', ref: 'img:1' });
  expect(markAgentImageBuilding(db, projectId, first.savedAt)).toBe(false);
  finishAgentImage(db, { projectId, savedAt: first.savedAt }, { error: 'late' });
  expect(readAgentImage(db, projectId)?.status).toBe('queued');
  await Bun.sleep(2);
  expect(discardPendingAgentImage(db, projectId)?.status).toBe('idle');
  expect(readAgentImage(db, projectId)?.pending).toBeNull();
  expect(syncCommands()).toBe(3);
});

test('discarding with nothing saved queues nothing', () => {
  expect(discardPendingAgentImage(db, projectId)).toBeNull();
  expect(syncCommands()).toBe(0);
});
