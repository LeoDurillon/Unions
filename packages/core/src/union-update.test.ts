import { describe, expect, test } from 'bun:test';

import {
  needsInstall,
  newMigrations,
  parseAheadBehind,
  updateBackupsToDrop,
  updateRefusal,
  type CheckoutFacts,
} from './union-update';

const CLEAN: CheckoutFacts = { branch: 'main', dirty: false, ahead: 0, supervised: true };

describe('updateRefusal', () => {
  test('a clean main under compose can update', () => {
    expect(updateRefusal(CLEAN)).toBeNull();
  });

  test('refuses without a supervisor first', () => {
    expect(updateRefusal({ ...CLEAN, supervised: false, dirty: true })).toContain('compose');
  });

  test('refuses another branch and a detached HEAD', () => {
    expect(updateRefusal({ ...CLEAN, branch: 'feature' })).toBe(
      'On branch feature; only main updates',
    );
    expect(updateRefusal({ ...CLEAN, branch: null })).toContain('detached');
  });

  test('refuses uncommitted changes and local commits', () => {
    expect(updateRefusal({ ...CLEAN, dirty: true })).toContain('uncommitted');
    expect(updateRefusal({ ...CLEAN, ahead: 1 })).toBe(
      '1 local commit not on origin/main: cannot fast-forward',
    );
    expect(updateRefusal({ ...CLEAN, ahead: 2 })).toContain('2 local commits');
  });
});

describe('parseAheadBehind', () => {
  test('reads both counts', () => {
    expect(parseAheadBehind('0\t4\n')).toEqual({ ahead: 0, behind: 4 });
  });

  test('throws on anything else', () => {
    expect(() => parseAheadBehind('fatal')).toThrow();
  });
});

describe('needsInstall', () => {
  test('the lockfile and any package.json', () => {
    expect(needsInstall(['bun.lock'])).toBe(true);
    expect(needsInstall(['apps/web/package.json'])).toBe(true);
    expect(needsInstall(['apps/web/src/app.ts', 'docs/spec/README.md'])).toBe(false);
  });
});

describe('newMigrations', () => {
  test('only the SQL files of the migrations folder', () => {
    expect(
      newMigrations([
        'packages/core/drizzle/0065_x.sql',
        'packages/core/drizzle/meta/_journal.json',
        'packages/core/src/schema.ts',
      ]),
    ).toEqual(['packages/core/drizzle/0065_x.sql']);
  });
});

describe('updateBackupsToDrop', () => {
  test('keeps the newest update backups and never touches the manual ones', () => {
    const names = [
      'union-2026-10-01-100000.sqlite',
      'union-update-2026-10-03-100000.sqlite',
      'union-update-2026-10-01-100000.sqlite',
      'union-update-2026-10-02-100000.sqlite',
      'union-update-notes.txt',
    ];
    expect(updateBackupsToDrop(names, 2)).toEqual(['union-update-2026-10-01-100000.sqlite']);
    expect(updateBackupsToDrop(names, 5)).toEqual([]);
  });
});
