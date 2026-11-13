// Tests a Jira field set by hand: where an edit starts from, and the change sent (labels as a whole, picks by id).
import { expect, test } from 'bun:test';

import { jiraEditStart, jiraHandChange } from './jira-hand-value';

test('an edit starts from what a rule would type, or from what the field holds', () => {
  expect(jiraEditStart('multi_option', [{ value: 'Web' }, { value: 'iOS' }])).toEqual({
    value: 'Web, iOS',
  });
  expect(jiraEditStart('labels', ['ui', 'qa'])).toEqual({ value: 'ui, qa' });
  expect(jiraEditStart('date', null)).toEqual({ value: '' });
  expect(jiraEditStart('user', { accountId: 'a1', displayName: 'Ada' })).toEqual({
    value: 'Ada',
    picks: [{ id: 'a1', name: 'Ada' }],
  });
  expect(jiraEditStart('components', [{ id: '3', name: 'API' }])).toEqual({
    value: 'API',
    picks: [{ id: '3', name: 'API' }],
  });
  expect(jiraEditStart('user', null)).toEqual({ value: '', picks: [] });
});

test('typed values are shaped as the rules shape them; empty clears', () => {
  expect(jiraHandChange({ id: 'customfield_1', type: 'number' }, '3', [])).toEqual({
    fields: { customfield_1: 3 },
  });
  expect(jiraHandChange({ id: 'duedate', type: 'date' }, '', [])).toEqual({
    fields: { duedate: null },
  });
  expect(jiraHandChange({ id: 'c', type: 'option' }, 'Web', [])).toEqual({
    fields: { c: { value: 'Web' } },
  });
  expect(jiraHandChange({ id: 'n', type: 'number' }, 'many', [])).toEqual({
    error: '"many" is not a number',
  });
});

test('labels replace the issue’s, and none clears them', () => {
  expect(jiraHandChange({ id: 'labels', type: 'labels' }, 'ui, qa', [])).toEqual({
    fields: { labels: ['ui', 'qa'] },
  });
  expect(jiraHandChange({ id: 'labels', type: 'labels' }, '', [])).toEqual({
    fields: { labels: [] },
  });
  expect(jiraHandChange({ id: 'labels', type: 'labels' }, 'to do', [])).toEqual({
    error: 'A Jira label has no spaces: "to do"',
  });
});

test('picked fields send their ids; a field Union does not know is refused', () => {
  expect(jiraHandChange({ id: 'assignee', type: 'user' }, '', [{ id: 'a1', name: 'Ada' }])).toEqual(
    {
      fields: { assignee: { accountId: 'a1' } },
    },
  );
  expect(jiraHandChange({ id: 'assignee', type: 'user' }, '', [])).toEqual({
    fields: { assignee: null },
  });
  expect(
    jiraHandChange({ id: 'fixVersions', type: 'versions' }, '', [{ id: '10', name: '2.4' }]),
  ).toEqual({
    fields: { fixVersions: [{ id: '10' }] },
  });
  expect(jiraHandChange({ id: 'priority', type: 'priority' }, 'High', [])).toEqual({
    error: 'Union cannot set a Jira priority field',
  });
});
