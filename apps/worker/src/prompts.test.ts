import { expect, test } from 'bun:test';

import type { Attachment, Ticket } from '@union/core';

import { buildPrompt, isPlanningStep } from './prompts';

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
