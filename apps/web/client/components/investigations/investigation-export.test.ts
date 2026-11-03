import { expect, test } from 'bun:test';

import type { Investigation } from '@union/core';

import { investigationFileName, investigationMarkdown } from './investigation-export';

const CREATED = Date.UTC(2026, 10, 3, 9, 30);

function investigation(fields: Partial<Investigation> = {}): Investigation {
  return {
    id: 7,
    projectId: 1,
    title: 'Où vient le bug de cache ?',
    prompt: 'Why is the cache stale?',
    history: [],
    scope: 'repository',
    onTicketId: null,
    model: 'opus',
    tools: ['Read', 'Grep'],
    status: 'succeeded',
    result: 'Because **TTL** is 0.',
    error: null,
    startedAt: CREATED,
    finishedAt: CREATED,
    ticketStatus: null,
    ticketContext: null,
    ticketTarget: null,
    ticketError: null,
    ticketId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...fields,
  };
}

test('one question: its settings, the question and the answer, unnumbered', () => {
  expect(investigationMarkdown(investigation())).toBe(
    [
      '# Où vient le bug de cache ?',
      '- Scope: Repository\n- Model: Opus (most capable)\n- Tools: Read, Grep\n- Status: done\n- Asked: 2026-11-03',
      '## Question',
      'Why is the cache stale?',
      '## Answer',
      'Because **TTL** is 0.\n',
    ].join('\n\n'),
  );
});

test('follow-ups are numbered, oldest first, the latest last', () => {
  const text = investigationMarkdown(
    investigation({ history: [{ prompt: 'First?', answer: 'One.' }], prompt: 'Second?' }),
  );
  expect(text.indexOf('## Question 1\n\nFirst?\n\n## Answer 1\n\nOne.')).toBeGreaterThan(0);
  expect(text).toContain('## Question 2\n\nSecond?\n\n## Answer 2\n\nBecause **TTL** is 0.');
});

test('a latest question with no answer says why', () => {
  expect(investigationMarkdown(investigation({ status: 'running', result: null }))).toContain(
    '_No answer yet (running)._',
  );
  expect(
    investigationMarkdown(investigation({ status: 'failed', result: null, error: 'boom' })),
  ).toContain('_The run failed:_\n\n```\nboom\n```');
});

test('the file name carries the id and the title in kebab case', () => {
  expect(investigationFileName(investigation())).toBe(
    'investigation-7-ou-vient-le-bug-de-cache.md',
  );
  expect(investigationFileName(investigation({ title: '???' }))).toBe('investigation-7.md');
});
