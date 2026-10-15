import { expect, test } from 'bun:test';

import { describeTicketBase, isBranchName } from './ticket-base';
import type { Ticket } from './tickets';

const started = { phase: { kind: 'done' }, chosenBaseBranch: null, baseBranch: null } as Ticket;
const parent = { branch: '1-parent', prState: 'closed' } as Ticket;

test('once started, the base is the one the clone took, and why', () => {
  expect(describeTicketBase(started, parent, 'main')).toEqual({
    branch: 'main',
    reason: 'project',
    fixed: true,
  });
  const fromParent = { ...started, baseBranch: '1-parent' };
  expect(describeTicketBase(fromParent, parent, 'main').reason).toBe('parent');
  const chosen = { ...started, baseBranch: 'release', chosenBaseBranch: 'release' };
  expect(describeTicketBase(chosen, parent, 'main').reason).toBe('chosen');
});

test('before it starts, a parent whose pull request ended leaves the project base', () => {
  const backlog = { ...started, phase: { kind: 'backlog' } } as Ticket;
  expect(describeTicketBase(backlog, parent, 'main')).toEqual({
    branch: 'main',
    reason: 'project',
    fixed: false,
  });
});

test('branch names: the usual forms pass, the ones git refuses do not', () => {
  for (const name of ['main', 'release/2.3', 'feature_x-1']) {
    expect(isBranchName(name)).toBe(true);
  }
  for (const name of ['-x', 'a..b', 'a/', 'a b', '.hidden', 'a.']) {
    expect(isBranchName(name)).toBe(false);
  }
});
