import { expect, test } from 'bun:test';

import type { ActionChoice } from '@union/core/event-actions';

import { offeredActionChoices, offeredCommentTargets } from './offered-action-kinds';

const GITHUB_AND_UNION: ActionChoice[] = [
  { kind: 'github_comment', tracker: null },
  { kind: 'github_pull_request', tracker: null },
  { kind: 'union_notification', tracker: null },
];
const COMMENT: ActionChoice = { kind: 'github_comment', tracker: null };
const NOTION_FIELDS: ActionChoice = { kind: 'tracker_fields', tracker: 'notion' };
const JIRA_FIELDS: ActionChoice = { kind: 'tracker_fields', tracker: 'jira' };

test("a tracker's actions are offered only to a project connected to it", () => {
  expect(offeredActionChoices(new Set(), COMMENT)).toEqual(GITHUB_AND_UNION);
  expect(offeredActionChoices(new Set(['notion']), COMMENT)).toEqual([
    ...GITHUB_AND_UNION,
    NOTION_FIELDS,
  ]);
  expect(offeredActionChoices(new Set(['jira']), COMMENT)).toEqual([
    ...GITHUB_AND_UNION,
    { kind: 'tracker_status', tracker: 'jira' },
    JIRA_FIELDS,
    { kind: 'tracker_comment', tracker: 'jira' },
  ]);
});

test('a rule keeps its own choice when its tracker is disconnected, and only that one', () => {
  expect(offeredActionChoices(new Set(), NOTION_FIELDS)).toEqual([
    ...GITHUB_AND_UNION,
    NOTION_FIELDS,
  ]);
  expect(offeredActionChoices(new Set(), JIRA_FIELDS)).toEqual([...GITHUB_AND_UNION, JIRA_FIELDS]);
});

test('the GitHub Project fields are offered only with a GitHub Project, or to a rule that sets them', () => {
  expect(offeredActionChoices(new Set(['github-project']), COMMENT)).toEqual([
    { kind: 'github_comment', tracker: null },
    { kind: 'github_pull_request', tracker: null },
    { kind: 'github_project_fields', tracker: null },
    { kind: 'union_notification', tracker: null },
  ]);
  expect(
    offeredActionChoices(new Set(), { kind: 'github_project_fields', tracker: null }),
  ).toContainEqual({ kind: 'github_project_fields', tracker: null });
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
