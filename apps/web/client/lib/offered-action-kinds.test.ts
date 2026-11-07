import { expect, test } from 'bun:test';

import type { ActionKind } from '@union/core/event-actions';

import { offeredActionKinds } from './offered-action-kinds';

const GITHUB_AND_UNION: ActionKind[] = [
  'github_comment',
  'github_pull_request',
  'github_project_fields',
  'union_notification',
];

test("a tracker's actions are offered only to a project connected to it", () => {
  expect(offeredActionKinds(new Set(), 'github_comment')).toEqual(GITHUB_AND_UNION);
  expect(offeredActionKinds(new Set(['notion']), 'github_comment')).toEqual([
    'notion_property',
    ...GITHUB_AND_UNION,
  ]);
  expect(offeredActionKinds(new Set(['jira']), 'github_comment')).toEqual([
    ...GITHUB_AND_UNION,
    'jira_transition',
    'jira_field',
    'jira_comment',
  ]);
});

test('a rule keeps its own kind when its tracker is disconnected, and only that one', () => {
  expect(offeredActionKinds(new Set(), 'notion_property')).toEqual([
    'notion_property',
    ...GITHUB_AND_UNION,
  ]);
  expect(offeredActionKinds(new Set(), 'jira_field')).toEqual([...GITHUB_AND_UNION, 'jira_field']);
});
