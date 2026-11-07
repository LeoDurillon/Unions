import { expect, test } from 'bun:test';

import type { JiraApi, JiraAuth } from './jira-api';
import { JiraError } from './jira-error';
import type { JiraIssue } from './jira-parse';
import { jiraProvider } from './jira-provider';
import { integrationKind } from './kinds';
import { ItemOutsideSourceError } from './provider';

/** What the promise rejects with; fails the test when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

const TOKEN = 'token-ok';
const CONFIG = { site: 'https://acme.atlassian.net', email: 'ada@acme.com', projectKey: 'ABC' };

const DESCRIPTION = {
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make it fast' }] }],
};

const ISSUES: Record<string, JiraIssue> = {
  'ABC-1': {
    key: 'ABC-1',
    summary: 'Add dark mode',
    projectKey: 'ABC',
    description: DESCRIPTION,
    attachments: [],
  },
  'XYZ-2': {
    key: 'XYZ-2',
    summary: 'Elsewhere',
    projectKey: 'XYZ',
    description: null,
    attachments: [],
  },
};

const calls: string[] = [];

function checked(auth: JiraAuth): void {
  if (auth.token !== TOKEN || auth.email !== CONFIG.email || auth.site !== CONFIG.site) {
    throw new JiraError('Jira rejected this email and API token.', 401);
  }
}

const jira: JiraApi = {
  myself: (auth) => {
    calls.push('myself');
    checked(auth);
    return Promise.resolve({ accountId: '557058:1', displayName: 'Ada' });
  },
  project: (auth, key) => {
    calls.push(`project ${key}`);
    checked(auth);
    return key === 'ABC'
      ? Promise.resolve({ key, name: 'Apollo', issueTypes: [{ id: '10001', name: 'Story' }] })
      : Promise.reject(new JiraError('Not found', 404));
  },
  statuses: () =>
    Promise.resolve([
      { id: '1', name: 'To Do', category: 'new' },
      { id: '3', name: 'Done', category: 'done' },
    ]),
  issue: (auth, key) => {
    checked(auth);
    const issue = ISSUES[key];
    return issue ? Promise.resolve(issue) : Promise.reject(new JiraError('Not found', 404));
  },
};

const provider = jiraProvider(jira);

test('verify checks the email and token, then names the project', async () => {
  calls.length = 0;
  expect(await provider.verify(TOKEN, CONFIG)).toEqual({ title: 'Apollo' });
  expect(calls).toEqual(['myself', 'project ABC']);
  expect(String(await rejection(provider.verify('wrong', CONFIG)))).toContain('rejected');
  expect(
    String(await rejection(provider.verify(TOKEN, { ...CONFIG, projectKey: 'NOPE' }))),
  ).toContain('Not found');
  expect(String(await rejection(provider.verify(TOKEN, { dataSourceId: 'x' })))).toContain(
    'incomplete',
  );
});

test('the fields are the project name, issue types and statuses', async () => {
  expect(await provider.readFields(TOKEN, CONFIG)).toEqual({
    title: 'Apollo',
    fields: {
      projectName: 'Apollo',
      issueTypes: [{ id: '10001', name: 'Story' }],
      statuses: [
        { id: '1', name: 'To Do', category: 'new' },
        { id: '3', name: 'Done', category: 'done' },
      ],
    },
  });
});

test('an issue of the project is imported with its description as markdown', async () => {
  expect(await provider.item(TOKEN, CONFIG, 'ABC-1')).toEqual({
    id: 'ABC-1',
    title: 'Add dark mode',
    url: 'https://acme.atlassian.net/browse/ABC-1',
    markdown: 'Make it fast',
    truncated: false,
  });
});

test('an issue of another project, or a missing one, is refused', async () => {
  expect(await rejection(provider.item(TOKEN, CONFIG, 'XYZ-2'))).toBeInstanceOf(
    ItemOutsideSourceError,
  );
  expect(String(await rejection(provider.item(TOKEN, CONFIG, 'ABC-404')))).toContain('Not found');
});

test('Jira cannot create issues yet, and its kind reads keys', () => {
  expect('createItem' in provider).toBe(false);
  const kind = integrationKind('jira');
  expect(kind.parseRef('https://acme.atlassian.net/browse/abc-1')).toBe('ABC-1');
  expect(kind.cleanMarkdown('**kept**')).toBe('**kept**');
  expect(kind.readConfig({ site: 'acme', email: 'a@b.c', projectKey: 'abc' })).toEqual({
    config: { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' },
  });
});
