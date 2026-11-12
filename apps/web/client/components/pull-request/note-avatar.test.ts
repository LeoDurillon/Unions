import { expect, test } from 'bun:test';

import { initialsOf } from './note-avatar';

test('initials take a letter per part of the login, else its first two', () => {
  expect(initialsOf('octo-cat')).toBe('OC');
  expect(initialsOf('coderabbitai[bot]')).toBe('CO');
  expect(initialsOf('ghost')).toBe('GH');
  expect(initialsOf('a_b_c')).toBe('AB');
});
