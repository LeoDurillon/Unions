import { expect, test } from 'bun:test';

import { branchName, slugify } from './branch';

test('slugs are lowercase ascii words joined by dashes, trimmed to a sane length', () => {
  expect(slugify('Add a "complete" command!')).toBe('add-a-complete-command');
  expect(slugify('Améliorer l’écran de connexion')).toBe('ameliorer-l-ecran-de-connexion');
  expect(slugify('  ---  ')).toBe('ticket');
  expect(slugify('x'.repeat(80)).length).toBeLessThanOrEqual(40);
});

test('branch names use the issue number when there is one', () => {
  expect(branchName({ id: 3, title: 'Fix login', issueNumber: 42 })).toBe('42-fix-login');
  expect(branchName({ id: 3, title: 'Fix login', issueNumber: null })).toBe('union-3-fix-login');
});
