// Tests the pull request action through the dispatcher: every change in one delivery, skips, retries.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  queueDeliveries,
  recentDeliveries,
  saveRule,
  schema,
  type Db,
  type NotionApi,
  type PullRequestChange,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { RequestError } from 'octokit';

import { EventDispatcher } from '../event-dispatcher';
import { FakeGitHubApi } from '../github/fake-api';

let db: Db;
let projectId: number;
let api: FakeGitHubApi;

const notion = {} as NotionApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  queueDeliveries(db);
  api = new FakeGitHubApi();
  api.pulls.push({
    number: 7,
    url: 'https://github.com/acme/shop/pull/7',
    head: 'union/search',
    base: 'main',
    title: 'Search',
    body: 'Adds search.',
    draft: false,
    labels: ['wip'],
  });
});

function pullRequestRule(changes: PullRequestChange[]): number {
  return saveRule(db, projectId, {
    name: 'Ready',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'github_pull_request', changes },
  }).id;
}

function openPullRequest(prNumber: number | null = 7): void {
  const ticket = createTicket(db, { projectId, title: 'Search' });
  db.update(schema.tickets).set({ prNumber }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: '' },
  });
}

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, notion, () => api);
  dispatcher.tick();
  await dispatcher.idle();
}

test('one delivery makes every change of the rule on the pull request', async () => {
  const ruleId = pullRequestRule([
    { kind: 'labels', add: ['qa'], remove: ['wip'] },
    { kind: 'reviewers', users: ['ada'] },
    { kind: 'assignees', users: ['grace'] },
    { kind: 'title', value: '[{ticket.id}] {ticket.title}' },
    { kind: 'description', value: 'QA: {pr.url}' },
  ]);
  openPullRequest();
  await dispatch();
  expect(api.pullByNumber(7)).toMatchObject({
    labels: ['qa'],
    reviewers: ['ada'],
    assignees: ['grace'],
    title: '[1] Search',
    body: `Adds search.\n\n<!-- union-rule:${ruleId} -->\nQA: https://github.com/acme/shop/pull/7\n<!-- /union-rule:${ruleId} -->`,
  });
  expect(recentDeliveries(db, projectId)).toMatchObject([
    {
      status: 'succeeded',
      detail:
        '#7: added labels qa, removed labels wip; requested reviews from @ada; assigned @grace; title set to "[1] Search"; description section written',
    },
  ]);
});

test('the description section is written once, however often the rule runs', async () => {
  pullRequestRule([{ kind: 'description', value: 'QA ready' }]);
  openPullRequest();
  openPullRequest();
  await dispatch();
  await dispatch();
  expect(api.pullByNumber(7).body.match(/QA ready/gu)).toHaveLength(1);
  expect(api.calls.filter((call) => call === 'updatePullRequestBody')).toHaveLength(1);
});

test('a ticket without a pull request is skipped', async () => {
  pullRequestRule([{ kind: 'assignees', users: ['grace'] }]);
  openPullRequest(null);
  await dispatch();
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'skipped', detail: 'The ticket has no pull request' },
  ]);
});

test('a refusal fails with what was done before it; a rate limit is tried again', async () => {
  pullRequestRule([
    { kind: 'labels', add: ['qa'], remove: [] },
    { kind: 'reviewers', users: ['ada'] },
  ]);
  const request = { method: 'POST' as const, url: 'https://api.github.com', headers: {} };
  let failure = new RequestError('Reviews may only be requested from collaborators', 422, {
    request,
  });
  api.requestReviewers = () => Promise.reject(failure);
  openPullRequest();
  await dispatch();
  expect(recentDeliveries(db, projectId)).toMatchObject([
    {
      status: 'failed',
      error: 'Reviews may only be requested from collaborators',
      detail: '#7: done before: added labels qa',
    },
  ]);

  failure = new RequestError('API rate limit exceeded', 403, { request });
  openPullRequest();
  await dispatch();
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({ status: 'pending', attempts: 1 });
});
