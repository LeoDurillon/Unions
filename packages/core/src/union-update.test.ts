import { describe, expect, test } from 'bun:test';

import { needsInstall, parseAheadBehind, updateRefusal, type CheckoutFacts } from './union-update';

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
