// Tests a pull request review's Jira issues: suggested from what the pull request names, linked, read, unlinked.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  JiraError,
  linkedJiraIssues,
  migrateDb,
  saveIntegration,
  schema,
  type Db,
  type JiraApi,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const SITE = 'https://acme.atlassian.net';

let db: Db;
let app: Hono;
let base: string;
let reviewId: number;

const jira = {
  issue: (_auth, key) =>
    key === 'ABC-404'
      ? Promise.reject(new JiraError('Not found, or not visible to this Jira account.', 404))
      : Promise.resolve({
          key,
          summary: `Summary of ${key}`,
          projectKey: key.split('-')[0] ?? '',
          description: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do it.' }] }],
          },
          attachments: [],
        }),
  comments: () => Promise.reject(new JiraError('Jira refused it.', 403)),
} satisfies Partial<JiraApi> as unknown as JiraApi;

const github = {
  getDiscussion: () =>
    Promise.resolve({
      description: `Fixes ABC-14, ABC-404 and ${SITE}/browse/ABC-15; UTF-8 everywhere.`,
    }),
} as unknown as OnboardingGitHub;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, {} as NotionApi, { jira });
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'ghp', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  saveIntegration(db, projectId, 'jira', {
    secret: 'tok',
    config: { site: SITE, email: 'a@b.c', projectKey: 'ABC' },
  });
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'ABC-12 Dark mode',
      url: 'u',
      author: 'a',
      headBranch: 'feature/abc-13-tokens',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  base = `/api/projects/${projectId}/pull-requests/reviews/7/jira`;
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  const init = { method, headers: { 'content-type': 'application/json' } };
  return app.request(path, body === undefined ? init : { ...init, body: JSON.stringify(body) });
}

test('the issues the pull request names are suggested: title, branch, description, readable ones only', async () => {
  const suggested = (await (await send('GET', `${base}/suggestions`)).json()) as { key: string }[];
  expect(suggested.map((issue) => issue.key)).toEqual(['ABC-12', 'ABC-13', 'ABC-14', 'ABC-15']);
});

test('an issue is linked as a spec of the review, read with its text, and unlinked', async () => {
  expect(await (await send('POST', `${base}/check`, { issue: 'XYZ-3' })).json()).toEqual({
    key: 'XYZ-3',
    summary: 'Summary of XYZ-3',
    url: `${SITE}/browse/XYZ-3`,
  });
  expect((await send('PUT', base, { issue: `${SITE}/browse/abc-12` })).status).toBe(200);
  expect(linkedJiraIssues(db, { kind: 'review', id: reviewId })).toEqual([
    { id: 'ABC-12', title: 'ABC-12 Summary of ABC-12', url: `${SITE}/browse/ABC-12` },
  ]);
  const suggested = (await (await send('GET', `${base}/suggestions`)).json()) as { key: string }[];
  expect(suggested.map((issue) => issue.key)).not.toContain('ABC-12');
  expect(await (await send('GET', base)).json()).toEqual([
    {
      key: 'ABC-12',
      summary: 'Summary of ABC-12',
      url: `${SITE}/browse/ABC-12`,
      markdown: 'Do it.',
      comments: { error: 'Jira refused it.' },
      properties: [],
      pendingFields: [],
    },
  ]);
  expect((await send('DELETE', `${base}/ABC-12`)).status).toBe(200);
  expect(linkedJiraIssues(db, { kind: 'review', id: reviewId })).toEqual([]);
});

test('a link of another site, a missing issue, or a project not connected is refused', async () => {
  expect(
    (await send('POST', `${base}/check`, { issue: 'https://other.atlassian.net/browse/ABC-1' }))
      .status,
  ).toBe(400);
  expect((await send('POST', `${base}/check`, { issue: 'ABC-404' })).status).toBe(404);
  db.delete(schema.integrations).run();
  expect((await send('PUT', base, { issue: 'ABC-12' })).status).toBe(409);
  expect(await (await send('GET', `${base}/suggestions`)).json()).toEqual([]);
});
