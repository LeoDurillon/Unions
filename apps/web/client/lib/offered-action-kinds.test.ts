import { expect, test } from 'bun:test';

import type { ActionKind } from '@union/core/event-actions';

import { offeredActionKinds, offeredCommentTargets } from './offered-action-kinds';

const GITHUB_AND_UNION: ActionKind[] = [
  'github_comment',
  'github_pull_request',
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

test('the GitHub Project fields are offered only with a GitHub Project, or to a rule that sets them', () => {
  expect(offeredActionKinds(new Set(['github-project']), 'github_comment')).toEqual([
    'github_comment',
    'github_pull_request',
    'github_project_fields',
    'union_notification',
  ]);
  expect(offeredActionKinds(new Set(), 'github_project_fields')).toContain('github_project_fields');
});

test('a comment goes on the issue only when the project mirrors issues, or the rule already does', () => {
  const saved = { on: 'issue', body: 'Done' } as const;
  expect(offeredCommentTargets(true, { ...saved, on: 'pull_request' })).toEqual([
    'issue',
    'pull_request',
  ]);
  expect(offeredCommentTargets(false, { ...saved, on: 'pull_request' })).toEqual(['pull_request']);
  expect(offeredCommentTargets(false, saved)).toEqual(['issue', 'pull_request']);
  expect(offeredCommentTargets(false, { on: 'issue', body: '' })).toEqual(['pull_request']);
});
