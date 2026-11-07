// Tests the ticket's Jira tab route: the issue's comments read now, refused for a ticket not from Jira.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  JiraError,
  migrateDb,
  removeIntegration,
  saveIntegration,
  schema,
  type Db,
  type JiraApi,
  type JiraComment,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const SITE = 'https://acme.atlassian.net';
const COMMENT: JiraComment = {
  id: '10010',
  author: 'Ada Lovelace',
  accountId: '557058:ada',
  created: '2026-11-07T09:00:00.000+0100',
  updated: '2026-11-07T09:00:00.000+0100',
  edited: false,
  restriction: null,
  markdown: 'Is it CSV or XLSX?',
  url: `${SITE}/browse/ABC-1?focusedCommentId=10010`,
};

let db: Db;
let app: Hono;
let projectId: number;
let asked: { token: string; key: string }[];
let failure: Error | null;

const jira = {
  comments: (auth, key) => {
    asked.push({ token: auth.token, key });
    return failure ? Promise.reject(failure) : Promise.resolve({ comments: [COMMENT], total: 1 });
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi, { jira });
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const config = { site: SITE, email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  asked = [];
  failure = null;
});

function jiraTicket(): number {
  return createTicket(db, {
    projectId,
    title: 'Dark mode',
    origin: { kind: 'jira', id: 'ABC-1', url: `${SITE}/browse/ABC-1` },
  }).id;
}

function read(ticketId: number): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/jira-comments`);
}

test("the tab reads the issue's comments with the project's token", async () => {
  const response = await read(jiraTicket());
  expect(await response.json()).toEqual({
    key: 'ABC-1',
    issueUrl: `${SITE}/browse/ABC-1`,
    comments: [COMMENT],
    total: 1,
  });
  expect(asked).toEqual([{ token: 'tok', key: 'ABC-1' }]);
});

test('a ticket not from Jira, or a project no longer connected, is refused without calling Jira', async () => {
  const written = createTicket(db, { projectId, title: 'Written in Union' }).id;
  const notFromJira = await read(written);
  expect(notFromJira.status).toBe(409);
  expect(await notFromJira.json()).toEqual({ error: 'This ticket was not imported from Jira' });
  const ticketId = jiraTicket();
  removeIntegration(db, projectId, 'jira');
  const disconnected = await read(ticketId);
  expect(disconnected.status).toBe(409);
  expect(await disconnected.json()).toEqual({ error: 'The project is not connected to Jira' });
  expect(asked).toEqual([]);
});

test("Jira's refusals reach the tab as their status and message", async () => {
  const ticketId = jiraTicket();
  failure = new JiraError('Jira rejected this email and API token.', 401);
  const rejected = await read(ticketId);
  expect(rejected.status).toBe(401);
  expect(await rejected.json()).toEqual({ error: 'Jira rejected this email and API token.' });
  failure = new JiraError('Not found, or not visible to this Jira account.', 404);
  expect((await read(ticketId)).status).toBe(404);
});
