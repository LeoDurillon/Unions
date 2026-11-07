import { expect, test } from 'bun:test';

import { canContinue, EMPTY_DRAFT, STEPS, verifiedTrackers, type Draft } from './draft';

const CONNECT_STEP = STEPS.findIndex((step) => step.label === 'Connect');

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

const BOARD = {
  id: 'PVT_1',
  number: 1,
  title: 'Board',
  url: 'https://github.com/orgs/o/projects/1',
};

function connected(missingScopes: string[]): Draft {
  return { ...EMPTY_DRAFT, viewer: { login: 'ada', missingScopes } };
}

test('a token without the project scope connects; only a GitHub Project then needs it', () => {
  expect(canContinue(CONNECT_STEP, connected(['project']))).toBe(true);
  expect(canContinue(CONNECT_STEP, connected(['repo', 'project']))).toBe(false);
  const none = connected(['project']);
  expect(canContinue(INTEGRATIONS_STEP, none)).toBe(true);
  const picked: Draft = { ...none, project: { kind: 'existing', project: BOARD } };
  expect(canContinue(INTEGRATIONS_STEP, picked)).toBe(false);
  expect(
    canContinue(INTEGRATIONS_STEP, { ...picked, viewer: { login: 'ada', missingScopes: [] } }),
  ).toBe(true);
});

test('a new GitHub Project needs a title', () => {
  const draft = connected([]);
  expect(canContinue(INTEGRATIONS_STEP, { ...draft, project: { kind: 'new', title: ' ' } })).toBe(
    false,
  );
  expect(
    canContinue(INTEGRATIONS_STEP, { ...draft, project: { kind: 'new', title: 'Board' } }),
  ).toBe(true);
});
