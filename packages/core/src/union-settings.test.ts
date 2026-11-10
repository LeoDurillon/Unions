// Tests of Union's machine settings: the defaults until saved, a change in whole GB, and the refusals.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import {
  DEFAULT_UNION_SETTINGS,
  saveUnionSettings,
  unionSettings,
  UnionSettingsError,
} from './union-settings';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('4 GB per agent container and 2 GB per preview service until a change is saved', () => {
  expect(unionSettings(db)).toEqual({ agentMemoryMb: 4096, previewServiceMemoryMb: 2048, cpus: 6 });
  expect(DEFAULT_UNION_SETTINGS.agentMemoryMb).toBe(4096);
});

test('a change in whole GB is saved, the other value kept', () => {
  expect(saveUnionSettings(db, { agentMemoryGb: 8 })).toEqual({
    agentMemoryMb: 8192,
    previewServiceMemoryMb: 2048,
    cpus: 6,
  });
  saveUnionSettings(db, { previewServiceMemoryGb: 3, cpus: 8 });
  expect(unionSettings(db)).toEqual({ agentMemoryMb: 8192, previewServiceMemoryMb: 3072, cpus: 8 });
  expect(() => saveUnionSettings(db, { cpus: 0 })).toThrow(UnionSettingsError);
});

test('anything but a whole number of GB from 1 to 64 is refused', () => {
  const store = db;
  const refused = [0, 65, 2.5, '4', null].filter((value) => {
    try {
      saveUnionSettings(store, { agentMemoryGb: value });
      return false;
    } catch (error) {
      return error instanceof UnionSettingsError;
    }
  });
  expect(refused).toHaveLength(5);
  expect(unionSettings(db).agentMemoryMb).toBe(4096);
});
