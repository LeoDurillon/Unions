// Tests for the initials a project shows on the folded sidebar.
import { expect, test } from 'bun:test';

import { repoInitials } from './repo-initials';

test('takes the first letters of the first two words', () => {
  expect(repoInitials('union-next')).toBe('UN');
  expect(repoInitials('my_cool.app')).toBe('MC');
  expect(repoInitials('SenovaPortal')).toBe('SP');
});

test('a single word keeps its first two letters, the first capitalised', () => {
  expect(repoInitials('website')).toBe('We');
  expect(repoInitials('-x-')).toBe('X');
});
