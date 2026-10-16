// Tests the GitHub comment action through the dispatcher: where it comments, what it skips, retries.
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
  type CommentTarget,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { RequestError } from 'octokit';

import { EventDispatcher } from '../event-dispatcher';
import { FakeGitHubApi } from '../github/fake-api';

let db: Db;
let projectId: number;
let api: FakeGitHubApi;
let comments: { number: number; body: string }[];
let failure: Error | null;

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
  comments = [];
  failure = null;
  api = new FakeGitHubApi();
  api.createComment = (_repo, number, body) => {
    if (failure) {
      return Promise.reject(failure);
    }
    comments.push({ number, body });
    return Promise.resolve(String(comments.length));
  };
});

function commentRule(on: CommentTarget): void {
  saveRule(db, projectId, {
    name: 'Ready',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'github_comment', on, body: 'Ready for QA: {pr.url}' },
  });
}

function openPullRequest(issueNumber: number | null = 3): void {
  const ticket = createTicket(db, { projectId, title: 'Search' });
  db.update(schema.tickets)
    .set({ prNumber: 7, issueNumber })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: '' },
  });
}

async function dispatch(withGitHub = true): Promise<void> {
  const dispatcher = new EventDispatcher(db, notion, () => (withGitHub ? api : null));
  dispatcher.tick();
  await dispatcher.idle();
}

function requestError(status: number, message: string): RequestError {
  return new RequestError(message, status, {
    request: { method: 'POST', url: 'https://api.github.com', headers: {} },
  });
}

test('the comment goes on the pull request or the issue, as the rule says', async () => {
  commentRule('pull_request');
  commentRule('issue');
  openPullRequest();
  await dispatch();
  await dispatch();
  const body = 'Ready for QA: https://github.com/acme/shop/pull/7';
  expect(comments).toEqual([
    { number: 7, body },
    { number: 3, body },
  ]);
  expect(recentDeliveries(db, projectId).map((delivery) => delivery.detail)).toEqual([
    'Commented on #3',
    'Commented on #7',
  ]);
});

test('one comment per tick at most: the next one waits', async () => {
  commentRule('pull_request');
  openPullRequest();
  openPullRequest();
  await dispatch();
  expect(comments).toHaveLength(1);
  await dispatch();
  expect(comments).toHaveLength(2);
});

test('a ticket without an issue is skipped', async () => {
  commentRule('issue');
  openPullRequest(null);
  await dispatch();
  expect(comments).toEqual([]);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'skipped', detail: 'The ticket has no issue yet' },
  ]);
});

test('a rate limit is tried again later; a refusal fails at once', async () => {
  commentRule('pull_request');
  openPullRequest();
  failure = requestError(403, 'You have exceeded a secondary rate limit');
  await dispatch();
  expect(recentDeliveries(db, projectId)).toMatchObject([{ status: 'pending', attempts: 1 }]);

  db.delete(schema.eventDeliveries).run();
  openPullRequest();
  failure = requestError(404, 'Not Found');
  await dispatch();
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'failed', error: 'Not Found', detail: 'Tried to comment on #7' },
  ]);
});

test('a project without GitHub credentials fails the delivery', async () => {
  commentRule('pull_request');
  openPullRequest();
  await dispatch(false);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'failed', error: 'The project has no GitHub credentials' },
  ]);
});
