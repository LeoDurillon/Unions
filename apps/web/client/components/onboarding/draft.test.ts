import { expect, test } from 'bun:test';

import { canContinue, EMPTY_DRAFT, STEPS, verifiedTrackers, type Draft } from './draft';

const INTEGRATIONS_STEP = STEPS.findIndex((step) => step.label === 'Integrations');

const JIRA_CONFIG = { site: ' acme ', email: 'ada@acme.com', projectKey: 'ABC' };

function withJira(title: string | null): Draft {
  return {
    ...EMPTY_DRAFT,
    trackers: { ...EMPTY_DRAFT.trackers, jira: { secret: ' tok ', config: JIRA_CONFIG, title } },
  };
}

test('empty trackers are skipped; a filled one waits for Verify, whichever is shown', () => {
  expect(canContinue(INTEGRATIONS_STEP, EMPTY_DRAFT)).toBe(true);
  expect(canContinue(INTEGRATIONS_STEP, withJira(null))).toBe(false);
  expect(canContinue(INTEGRATIONS_STEP, withJira('Apollo'))).toBe(true);
  const notionTyped = withJira('Apollo');
  notionTyped.trackers.notion = { secret: 'ntn_x', config: { dataSourceId: '' }, title: null };
  expect(canContinue(INTEGRATIONS_STEP, notionTyped)).toBe(false);
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
