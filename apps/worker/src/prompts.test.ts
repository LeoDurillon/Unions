import { expect, test } from 'bun:test';

import type { Ticket } from '@union/core';

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
