import { beforeEach, expect, test } from 'bun:test';

import type { JiraApi, JiraFieldAction } from '@union/core';

import { deliverJiraFields } from './jira-field';
import type { JiraIssueTarget } from './jira-target';

const BOARD = '/rest/agile/1.0/board?projectKeyOrId=ABC&type=scrum';
const SPRINTS = '/rest/agile/1.0/board/7/sprint?state=active,future';

let sent: unknown[];
let sprints: { id: number; name: string; state: string }[];

const jira = {
  read: (_auth, path) => {
    if (path === BOARD) {
      return Promise.resolve({ values: [{ id: 7 }] });
    }
    return path === SPRINTS
      ? Promise.resolve({ values: sprints })
      : Promise.reject(new Error(path));
  },
  editMeta: () =>
    Promise.resolve({
      assignee: { allowedValues: null },
      fixVersions: { allowedValues: null },
      customfield_10020: { allowedValues: null },
      customfield_7: { allowedValues: ['Web', 'iOS', 'Android'] },
    }),
  updateIssue: (_auth, _key, change) => {
    sent.push(change);
    return Promise.resolve();
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

const target: JiraIssueTarget = {
  auth: { site: 'https://acme.atlassian.net', email: 'a@b.c', token: 't' },
  key: 'ABC-12',
  values: {},
};

function action(values: JiraFieldAction['values']): JiraFieldAction {
  return { kind: 'jira_field', values };
}

beforeEach(() => {
  sent = [];
  sprints = [
    { id: 41, name: 'Sprint 12', state: 'active' },
    { id: 42, name: 'Sprint 13', state: 'future' },
  ];
});

const PICKED = action([
  {
    fieldId: 'assignee',
    fieldName: 'Assignee',
    fieldType: 'user',
    value: 'Ada',
    picks: [{ id: 'u1', name: 'Ada' }],
  },
  {
    fieldId: 'fixVersions',
    fieldName: 'Fix versions',
    fieldType: 'versions',
    value: '2.4',
    picks: [{ id: '10', name: '2.4' }],
  },
  {
    fieldId: 'customfield_10020',
    fieldName: 'Sprint',
    fieldType: 'sprint',
    value: 'The active sprint',
    picks: [{ id: 'active', name: 'The active sprint' }],
  },
  {
    fieldId: 'customfield_7',
    fieldName: 'Platforms',
    fieldType: 'multi_option',
    value: 'Web, iOS',
  },
]);

test("picked values are sent by id, the active sprint resolved on the project's board", async () => {
  expect(await deliverJiraFields(jira, target, PICKED)).toEqual({
    status: 'succeeded',
    detail:
      'ABC-12: Assignee set to "Ada", Fix versions set to "2.4", Sprint set to "The active sprint (Sprint 12)", Platforms set to "Web, iOS"',
  });
  expect(sent).toEqual([
    {
      fields: {
        assignee: { accountId: 'u1' },
        fixVersions: [{ id: '10' }],
        customfield_10020: 41,
        customfield_7: [{ value: 'Web' }, { value: 'iOS' }],
      },
      update: {},
    },
  ]);
});

test('no person clears the field; an unknown option or no active sprint fails, sending nothing', async () => {
  const nobody = action([
    { fieldId: 'assignee', fieldName: 'Assignee', fieldType: 'user', value: '', picks: [] },
  ]);
  expect(await deliverJiraFields(jira, target, nobody)).toMatchObject({ status: 'succeeded' });
  expect(sent).toEqual([{ fields: { assignee: null }, update: {} }]);
  sent = [];
  const unknown = action([
    {
      fieldId: 'customfield_7',
      fieldName: 'Platforms',
      fieldType: 'multi_option',
      value: 'Web, Linux',
    },
  ]);
  expect(await deliverJiraFields(jira, target, unknown)).toMatchObject({
    status: 'failed',
    error: 'Platforms: "Linux" is not one of its options (Web, iOS, Android)',
  });
  sprints = [];
  expect(await deliverJiraFields(jira, target, PICKED)).toMatchObject({
    status: 'failed',
    error: 'The board has no active sprint',
  });
  expect(sent).toEqual([]);
});
