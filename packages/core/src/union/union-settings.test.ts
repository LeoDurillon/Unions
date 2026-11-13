// Tests of Union's machine settings: the defaults until saved, a change in whole GB, and the refusals.

import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import { imageSetting, saveUnionSettings, unionSettings } from './union-settings';
import {
  DEFAULT_IMAGES,
  DEFAULT_UNION_SETTINGS,
  UnionSettingsError,
} from './union-settings-fields';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

/** The refused values of one field, out of `values`. */
function refused(field: string, values: unknown[]): unknown[] {
  const store = db;
  return values.filter((value) => {
    try {
      saveUnionSettings(store, { [field]: value });
      return false;
    } catch (error) {
      return error instanceof UnionSettingsError;
    }
  });
}

test('the defaults until a change is saved', () => {
  expect(unionSettings(db)).toEqual(DEFAULT_UNION_SETTINGS);
  expect(DEFAULT_UNION_SETTINGS).toMatchObject({
    agentMemoryMb: 4096,
    previewServiceMemoryMb: 2048,
    cpus: 6,
    maxConcurrentRuns: 2,
    maxPreviews: 3,
    githubPullSeconds: 30,
    maxProjectFileMb: 2048,
  });
  expect(imageSetting(db, 'agentImage')).toBe('union-agent:local');
});

test('a change in whole GB is saved, the other values kept', () => {
  expect(saveUnionSettings(db, { agentMemoryGb: 8 })).toEqual({
    ...DEFAULT_UNION_SETTINGS,
    agentMemoryMb: 8192,
  });
  saveUnionSettings(db, { previewServiceMemoryGb: 3, cpus: 8, maxConcurrentRuns: 4 });
  expect(unionSettings(db)).toEqual({
    ...DEFAULT_UNION_SETTINGS,
    agentMemoryMb: 8192,
    previewServiceMemoryMb: 3072,
    cpus: 8,
    maxConcurrentRuns: 4,
  });
  expect(() => saveUnionSettings(db, { cpus: 0 })).toThrow(UnionSettingsError);
});

test('anything but a whole number of GB from 1 to 64 is refused', () => {
  expect(refused('agentMemoryGb', [0, 65, 2.5, '4', null])).toHaveLength(5);
  expect(unionSettings(db).agentMemoryMb).toBe(4096);
});

test('the counts are refused out of their bounds', () => {
  expect(refused('maxConcurrentRuns', [0, 17, 1.5, '2'])).toHaveLength(4);
  expect(refused('maxPreviews', [0, 21])).toHaveLength(2);
  expect(refused('githubPullSeconds', [9, 3601])).toHaveLength(2);
  expect(refused('maxProjectFileMb', [0, 10_241])).toHaveLength(2);
  saveUnionSettings(db, { githubPullSeconds: 120, maxProjectFileMb: 4096, maxPreviews: 5 });
  expect(unionSettings(db)).toMatchObject({
    githubPullSeconds: 120,
    maxProjectFileMb: 4096,
    maxPreviews: 5,
  });
});

test('an image is a name, trimmed; empty or null goes back to the default', () => {
  saveUnionSettings(db, { agentImage: '  ghcr.io/acme/agent:1.2 ', agentBaseImage: 'base' });
  expect(imageSetting(db, 'agentImage')).toBe('ghcr.io/acme/agent:1.2');
  expect(unionSettings(db).agentBaseImage).toBe('base');
  saveUnionSettings(db, { agentImage: '', agentBaseImage: null });
  expect(unionSettings(db).agentImage).toBeNull();
  expect(imageSetting(db, 'agentBaseImage')).toBe(DEFAULT_IMAGES.agentBaseImage);
  expect(imageSetting(db, 'composeImage')).toBe(DEFAULT_IMAGES.composeImage);
});

test('a value that is not an image name is refused', () => {
  const bad = ['-v /:/host', 'a b', 'img;rm -rf', 'Upper/Case', 4, 'x'.repeat(256)];
  expect(refused('composeImage', bad)).toHaveLength(bad.length);
  expect(refused('composeImage', [DEFAULT_IMAGES.composeImage])).toHaveLength(0);
});
