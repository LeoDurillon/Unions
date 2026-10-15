import { expect, test } from 'bun:test';

import type { Attachment, Ticket } from '@union/core';

import { buildPrompt, isPlanningStep, parentChanges, parentSection } from './prompts';

const ticket = { title: 'Add search', body: 'Typos should match.' } as Ticket;

test('the prompt is shared instructions, task, approved outputs, then the step instructions', () => {
  const prompt = buildPrompt({
    ticket,
    shared: 'SHARED RULES',
    instructions: 'STEP RULES',
    approved: [{ step: 'intake', content: 'intake output' }],
    revision: null,
  });
  const order = [
    'SHARED RULES',
    '## Add search',
    '# Approved: intake',
    '# Your job\n\nSTEP RULES',
  ].map((part) => prompt.indexOf(part));
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order.toSorted((a, b) => a - b)).toEqual(order);
  expect(prompt).not.toContain('# Revision');
});

test('a revision adds the previous version and the feedback', () => {
  const prompt = buildPrompt({
    ticket,
    shared: 's',
    instructions: 'i',
    approved: [],
    revision: { previous: 'old text', feedback: 'shorter' },
  });
  expect(prompt).toContain('Your previous version:\n\nold text');
  expect(prompt).toContain('User feedback:\n\nshorter');
});

test('only the four planning steps are planning steps', () => {
  expect(isPlanningStep('test_plan')).toBe(true);
  expect(isPlanningStep('implement')).toBe(false);
});

test('a parent ticket is described after the task', () => {
  const parent = { id: 3, issueNumber: 12, title: 'Search index', body: 'Index titles.' } as Ticket;
  const prompt = buildPrompt({
    ticket,
    parent,
    shared: 's',
    instructions: 'i',
    approved: [],
    revision: null,
  });
  expect(prompt).toContain('# Builds on\n\nThis ticket builds on #12 "Search index"');
  expect(prompt.indexOf('# Builds on')).toBeGreaterThan(prompt.indexOf('## Add search'));
  expect(prompt).toContain('Index titles.');
});

test('attached files are listed with where they are and what may not be committed', () => {
  const attachment = {
    name: 'orders.csv',
    size: 2048,
    contentType: 'text/csv',
    note: 'the import fails on it',
    allowInRepo: false,
  } as Attachment;
  const prompt = buildPrompt({
    ticket,
    shared: 's',
    instructions: 'i',
    approved: [],
    revision: null,
    attachments: [attachment, { ...attachment, name: 'fixture.json', note: '', allowInRepo: true }],
  });
  expect(prompt).toContain('`/workspace/attachments/`');
  expect(prompt).toContain('- `orders.csv` (2.0 KB, text/csv, private): the import fails on it');
  expect(prompt).toContain('- `fixture.json` (2.0 KB, text/csv, may be added to the repository)\n');
  expect(prompt.indexOf('# Attached files')).toBeLessThan(prompt.indexOf('# Your job'));
  expect(
    buildPrompt({ ticket, shared: 's', instructions: 'i', approved: [], revision: null }),
  ).not.toContain('# Attached files');
});

const parent = {
  id: 4,
  issueNumber: 12,
  title: 'Add the index',
  body: 'Index the names.',
  branch: 'union/ticket-4',
  baseBranch: null,
  prNumber: 30,
} as Ticket;

test('a stacked child points at its parent branch, compared with the parent base', () => {
  const child = { ...ticket, baseBranch: 'union/ticket-4' } as Ticket;
  const prompt = buildPrompt({
    ticket: child,
    parent,
    projectBase: 'dev',
    shared: 's',
    instructions: 'i',
    approved: [],
    revision: null,
  });
  expect(prompt).toContain('# Builds on');
  expect(prompt).toContain('Index the names.');
  expect(prompt).toContain('git diff origin/dev...origin/union/ticket-4');
});

test('a child of a merged parent finds its commit through the pull request number', () => {
  const child = { ...ticket, baseBranch: null } as Ticket;
  expect(parentChanges(parent, child, 'dev')).toContain(
    "git log --oneline --grep '#30' origin/dev",
  );
});

test('a parent without a branch gets no pointer', () => {
  expect(parentChanges({ ...parent, branch: null }, ticket, 'dev')).toBe('');
});

test("a child of a closed parent is told the parent's changes are not in its code", () => {
  const closed = { ...parent, prState: 'closed' } as Ticket;
  const section = parentSection(closed, { ...ticket, baseBranch: null }, 'dev');
  expect(section).toContain('#30 was closed without being merged');
  expect(section).toContain('NOT in the code');
  expect(section).not.toContain('already in the code');
  expect(section).toContain('Index the names.');
});

test("a child started from a branch the user chose is not told the parent's changes are there", () => {
  const child = { ...ticket, baseBranch: 'release', chosenBaseBranch: 'release' };
  const section = parentSection(parent, child, 'dev');
  expect(section).toContain('The user chose to start it from `release`');
  expect(section).not.toContain('already in the code');
});
