import { expect, test } from 'bun:test';

import { canContinue, EMPTY_DRAFT, STEPS, verifiedTrackers, type Draft } from './draft';

const NOTION_STEP = STEPS.findIndex((step) => step.label === 'Notion');
const JIRA_STEP = STEPS.findIndex((step) => step.label === 'Jira');

const JIRA_CONFIG = { site: ' acme ', email: 'ada@acme.com', projectKey: 'ABC' };

function withJira(title: string | null): Draft {
  return {
    ...EMPTY_DRAFT,
    trackers: { ...EMPTY_DRAFT.trackers, jira: { secret: ' tok ', config: JIRA_CONFIG, title } },
  };
}

test('an empty tracker step is skipped; a filled one waits for Verify', () => {
  expect(canContinue(NOTION_STEP, EMPTY_DRAFT)).toBe(true);
  expect(canContinue(JIRA_STEP, EMPTY_DRAFT)).toBe(true);
  expect(canContinue(JIRA_STEP, withJira(null))).toBe(false);
  expect(canContinue(JIRA_STEP, withJira('Apollo'))).toBe(true);
});

test('only verified trackers are sent with the new project, trimmed', () => {
  expect(verifiedTrackers(EMPTY_DRAFT)).toEqual([]);
  expect(verifiedTrackers(withJira(null))).toEqual([]);
  expect(verifiedTrackers(withJira('Apollo'))).toEqual([
    {
      kind: 'jira',
      secret: 'tok',
      config: { site: 'acme', email: 'ada@acme.com', projectKey: 'ABC' },
    },
  ]);
});
