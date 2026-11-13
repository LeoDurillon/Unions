// Tests reading a Jira issue's facts for the Jira tab's card: the fields, what is missing, a refusal.
import { expect, test } from 'bun:test';

import type { JiraApi } from './jira-api';
import { JiraError } from './jira-error';
import { issueFactsOf, readJiraIssueFacts } from './jira-issue-facts';

const AUTH = { site: 'https://acme.atlassian.net', email: 'a@b.c', token: 'tok' };

const BODY = {
  key: 'ABC-1',
  fields: {
    summary: 'Dark mode',
    issuetype: { name: 'Story' },
    status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    assignee: { displayName: 'Ada Lovelace' },
    updated: '2026-11-12T10:00:00.000+0100',
  },
};

test('the summary, type, status with its category, assignee and last update', () => {
  expect(issueFactsOf(BODY)).toEqual({
    summary: 'Dark mode',
    type: 'Story',
    status: { name: 'In Review', category: 'indeterminate' },
    assignee: 'Ada Lovelace',
    updatedAt: '2026-11-12T10:00:00.000+0100',
  });
});

test('an unassigned issue, an unknown category and missing fields read as null', () => {
  const body = {
    fields: {
      summary: 'X',
      assignee: null,
      status: { name: 'Odd', statusCategory: { key: 'weird' } },
    },
  };
  expect(issueFactsOf(body)).toEqual({
    summary: 'X',
    type: null,
    status: { name: 'Odd', category: null },
    assignee: null,
    updatedAt: null,
  });
  expect(issueFactsOf(null).status).toBeNull();
});

test('reads only the fields it shows, and gives null when Jira refuses', async () => {
  const paths: string[] = [];
  let refuse = false;
  const jira = {
    read: (_auth, path) => {
      paths.push(path);
      return refuse ? Promise.reject(new JiraError('Not found', 404)) : Promise.resolve(BODY);
    },
  } satisfies Partial<JiraApi> as unknown as JiraApi;
  expect((await readJiraIssueFacts(jira, AUTH, 'ABC-1'))?.summary).toBe('Dark mode');
  expect(paths).toEqual(['/issue/ABC-1?fields=summary,issuetype,status,assignee,updated']);
  refuse = true;
  expect(await readJiraIssueFacts(jira, AUTH, 'ABC-1')).toBeNull();
});
