import { expect, test } from 'bun:test';

import type { JiraApi } from './jira-api';
import { createJiraIssue, cutDescription, issueTypeFor } from './jira-create';

const TYPES = [
  { id: '10001', name: 'Story', subtask: false },
  { id: '10002', name: 'Task', subtask: false },
  { id: '10004', name: 'Sub-task', subtask: true },
];

test('the configured type when the project has it, else Task, else the first; never a sub-task', () => {
  expect(issueTypeFor(TYPES, '10001')).toBe('10001');
  expect(issueTypeFor(TYPES)).toBe('10002');
  expect(issueTypeFor(TYPES, '99')).toBe('10002');
  expect(issueTypeFor(TYPES, '10004')).toBe('10002');
  expect(issueTypeFor([TYPES[0], TYPES[2]].filter((type) => type !== undefined))).toBe('10001');
  expect(issueTypeFor([{ id: '1', name: 'Sub-task', subtask: true }])).toBeNull();
});

test('a description past Jira’s limit is cut at a paragraph, with a note', () => {
  expect(cutDescription('Short.')).toEqual({ markdown: 'Short.', cut: false });
  const long = `${'a'.repeat(29_990)}\n\n${'b'.repeat(100)}`;
  const { markdown, cut } = cutDescription(long);
  expect(cut).toBe(true);
  expect(markdown).toBe(`${'a'.repeat(29_990)}\n\n(cut: the full description is in Union)`);
});

test('the issue is created in the project with the description as rich text, and found at its key', async () => {
  const created: unknown[] = [];
  const jira = {
    project: (_auth, key) => Promise.resolve({ key, name: 'Apollo', issueTypes: TYPES }),
    createIssue: (auth, issue) => {
      created.push({ site: auth.site, token: auth.token, ...issue });
      return Promise.resolve({ key: 'ABC-12' });
    },
  } satisfies Partial<JiraApi> as unknown as JiraApi;
  const config = {
    site: 'https://acme.atlassian.net',
    email: 'a@b.c',
    projectKey: 'ABC',
    issueTypeId: '10001',
  };
  const item = await createJiraIssue(jira, 'tok', config, {
    title: `  ${'Fix the login '.repeat(30)}`,
    markdown: '## Problem\n\nSlow.',
  });
  expect(created).toEqual([
    {
      site: 'https://acme.atlassian.net',
      token: 'tok',
      projectKey: 'ABC',
      issueTypeId: '10001',
      summary: 'Fix the login '.repeat(30).trim().slice(0, 255),
      description: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Slow.' }] },
        ],
      },
    },
  ]);
  expect(item).toMatchObject({
    id: 'ABC-12',
    url: 'https://acme.atlassian.net/browse/ABC-12',
    truncated: false,
  });
  expect(createJiraIssue(jira, 'tok', { dataSourceId: 'x' }, item)).rejects.toThrow('incomplete');
});
