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
const MEDIA_ID = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
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
  // A file card names its file only by its Media Services id; the screenshot by its name.
  'ABC-3': {
    key: 'ABC-3',
    summary: 'With a file card',
    projectKey: 'ABC',
    description: {
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          content: [{ type: 'media', attrs: { id: MEDIA_ID.toUpperCase(), type: 'file' } }],
        },
        {
          type: 'mediaSingle',
          content: [{ type: 'media', attrs: { id: 'other', alt: 'screen.png', type: 'file' } }],
        },
      ],
    },
    attachments: [
      { id: '10', filename: 'screen.png', mimeType: 'image/png', content: '' },
      { id: '11', filename: 'Export.xlsx', mimeType: 'application/vnd.ms-excel', content: '' },
    ],
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
let mediaLookups: string[] = [];

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
  fields: () => Promise.resolve([{ id: 'customfield_10050', name: 'PR link', type: 'text' }]),
  // Imports only read: the writes rules make are not used here.
  transitions: () => Promise.resolve([]),
  issueStatus: () => Promise.reject(new Error('Not used')),
  editMeta: () => Promise.resolve({}),
  transitionIssue: () => Promise.reject(new Error('Not used')),
  updateIssue: () => Promise.reject(new Error('Not used')),
  addComment: () => Promise.reject(new Error('Not used')),
  attachmentMediaId: (auth, attachmentId) => {
    checked(auth);
    mediaLookups.push(attachmentId);
    if (attachmentId === '10') {
      return Promise.reject(new JiraError('Not found', 404));
    }
    return Promise.resolve(attachmentId === '11' ? MEDIA_ID : null);
  },
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

test('the fields are the project name, issue types, statuses and the settable fields', async () => {
  expect(await provider.readFields(TOKEN, CONFIG)).toEqual({
    title: 'Apollo',
    fields: {
      projectName: 'Apollo',
      issueTypes: [{ id: '10001', name: 'Story' }],
      statuses: [
        { id: '1', name: 'To Do', category: 'new' },
        { id: '3', name: 'Done', category: 'done' },
      ],
      fields: [{ id: 'customfield_10050', name: 'PR link', type: 'text' }],
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

test('a file card is matched by its media id, read from Jira only when a name does not match', async () => {
  mediaLookups = [];
  const { site } = CONFIG;
  expect((await provider.item(TOKEN, CONFIG, 'ABC-3')).markdown).toBe(
    [
      `[Export.xlsx](${site}/rest/api/3/attachment/content/11)`,
      // A lookup that fails (the screenshot's) leaves the match by name.
      `![screen.png](${site}/rest/api/3/attachment/content/10)`,
    ].join('\n\n'),
  );
  expect(mediaLookups.toSorted()).toEqual(['10', '11']);
  mediaLookups = [];
  await provider.item(TOKEN, CONFIG, 'ABC-1');
  expect(mediaLookups).toEqual([]);
});
