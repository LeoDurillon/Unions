import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  emitEvent,
  linkTrackerItem,
  migrateDb,
  queueDeliveries,
  recentDeliveries,
  saveIntegration,
  schema,
  type Db,
  type JiraApi,
} from '@union/core';

import { EventDispatcher } from '../event-dispatcher';

let db: Db;
let projectId: number;
let moved: string[];

const jira = {
  issueStatus: () => Promise.resolve({ id: '1', name: 'To Do' }),
  transitions: () =>
    Promise.resolve([{ id: '31', name: 'Start review', toId: '3', toName: 'In Review' }]),
  transitionIssue: (_auth, key) => {
    moved.push(key);
    return Promise.resolve();
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  saveIntegration(db, projectId, 'jira', {
    secret: 'tok',
    config: { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' },
  });
  queueDeliveries(db);
  db.insert(schema.eventRules)
    .values({
      projectId,
      name: 'Reviewed → In Review',
      enabled: true,
      trigger: { kind: 'pull_request_reviewed', verdict: null },
      action: { kind: 'tracker_status', tracker: 'jira', statusId: '3', statusName: 'In Review' },
    })
    .run();
  moved = [];
});

/** A review of someone else's pull request (no ticket), linked to these issues, posted. */
function postReview(keys: string[]): void {
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  for (const key of keys) {
    linkTrackerItem(db, { kind: 'review', id: reviewId }, 'jira', {
      id: key,
      title: `${key} summary`,
      url: null,
    });
  }
  emitEvent(db, {
    type: 'pr_review_posted',
    payload: { reviewId, number: 7, url: 'u#r1', verdict: 'approve' },
  });
}

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, {} as never, () => null, jira);
  dispatcher.tick();
  await dispatcher.idle();
}

test("a posted review's rule moves every issue the review is linked to", async () => {
  postReview(['ABC-1', 'ABC-2']);
  await dispatch();
  expect(moved).toEqual(['ABC-1', 'ABC-2']);
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'succeeded',
    detail: 'Moved ABC-1 from To Do to In Review; Moved ABC-2 from To Do to In Review',
  });
});

test('a posted review not linked to a Jira issue is skipped', async () => {
  postReview([]);
  await dispatch();
  expect(moved).toEqual([]);
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'skipped',
    detail: 'The pull request is not linked to a Jira issue',
  });
});
