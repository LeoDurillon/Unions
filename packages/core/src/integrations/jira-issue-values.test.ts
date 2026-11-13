// Tests reading a Jira issue's fields for its tab: the edit screen's fields, their values as text, which Union can set.
import { expect, test } from 'bun:test';

import { issuePropertiesOf } from './jira-issue-values';

const SPRINT = 'com.pyxis.greenhopper.jira:gh-sprint';

const BODY = {
  fields: {
    status: { name: 'In Progress' },
    summary: 'Dark mode',
    assignee: { displayName: 'Ada Lovelace', accountId: 'a1' },
    priority: { name: 'High' },
    labels: ['ui', 'theme'],
    fixVersions: [{ name: '2.4' }, { name: '2.5' }],
    duedate: null,
    customfield_1: { value: 'Web' },
    customfield_2: [{ name: 'Sprint 12', state: 'active' }],
    customfield_3: 5,
    customfield_4: '2026-11-12T10:00:00.000+0100',
    environment: {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chrome  on macOS' }] }],
    },
  },
  editmeta: {
    fields: {
      summary: { name: 'Summary', schema: { type: 'string', system: 'summary' } },
      assignee: { name: 'Assignee', schema: { type: 'user', system: 'assignee' } },
      priority: { name: 'Priority', schema: { type: 'priority', system: 'priority' } },
      labels: { name: 'Labels', schema: { type: 'array', items: 'string', system: 'labels' } },
      fixVersions: { name: 'Fix versions', schema: { type: 'array', items: 'version' } },
      duedate: { name: 'Due date', schema: { type: 'date', system: 'duedate' } },
      customfield_1: { name: 'Platform', schema: { type: 'option', custom: 'x:select' } },
      customfield_2: { name: 'Sprint', schema: { type: 'array', items: 'json', custom: SPRINT } },
      customfield_3: { name: 'Points', schema: { type: 'number', custom: 'x:float' } },
      customfield_4: { name: 'Started', schema: { type: 'datetime', custom: 'x:datetime' } },
      environment: { name: 'Environment', schema: { type: 'string', system: 'environment' } },
    },
  },
};

test('the status, then each field of the edit screen with its value and whether it can be set', () => {
  expect(issuePropertiesOf(BODY)).toEqual([
    {
      id: 'status',
      name: 'Status',
      type: 'status',
      text: 'In Progress',
      value: 'In Progress',
      options: [],
      settable: false,
    },
    {
      id: 'assignee',
      name: 'Assignee',
      type: 'user',
      text: 'Ada Lovelace',
      value: 'Ada Lovelace',
      options: [],
      settable: true,
    },
    {
      id: 'priority',
      name: 'Priority',
      type: 'priority',
      text: 'High',
      value: 'High',
      options: [],
      settable: false,
    },
    {
      id: 'labels',
      name: 'Labels',
      type: 'labels',
      text: 'ui, theme',
      value: 'ui, theme',
      options: [],
      settable: true,
    },
    {
      id: 'fixVersions',
      name: 'Fix versions',
      type: 'versions',
      text: '2.4, 2.5',
      value: '2.4, 2.5',
      options: [],
      settable: true,
    },
    {
      id: 'duedate',
      name: 'Due date',
      type: 'date',
      text: '',
      value: '',
      options: [],
      settable: true,
    },
    {
      id: 'customfield_1',
      name: 'Platform',
      type: 'option',
      text: 'Web',
      value: 'Web',
      options: [],
      settable: true,
    },
    {
      id: 'customfield_2',
      name: 'Sprint',
      type: 'sprint',
      text: 'Sprint 12',
      value: 'Sprint 12',
      options: [],
      settable: true,
    },
    {
      id: 'customfield_3',
      name: 'Points',
      type: 'number',
      text: '5',
      value: '5',
      options: [],
      settable: true,
    },
    {
      id: 'customfield_4',
      name: 'Started',
      type: 'datetime',
      text: '2026-11-12 10:00',
      value: '2026-11-12 10:00',
      options: [],
      settable: true,
    },
    {
      id: 'environment',
      name: 'Environment',
      type: 'textarea',
      text: 'Chrome on macOS',
      value: 'Chrome on macOS',
      options: [],
      settable: true,
    },
  ]);
});

test('an issue without an edit screen or a status lists nothing', () => {
  expect(issuePropertiesOf({ fields: {} })).toEqual([]);
  expect(issuePropertiesOf(null)).toEqual([]);
});
