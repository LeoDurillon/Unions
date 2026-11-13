// Tests the ticket's Jira tab route: the issue's comments read now, refused for a ticket not from Jira.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
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
import { eq } from 'drizzle-orm';
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
let issueRefused: boolean;

const ISSUE_BODY = {
  fields: {
    summary: 'Dark mode',
    issuetype: { name: 'Story' },
    status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    assignee: null,
    updated: '2026-11-12T10:00:00.000+0100',
  },
};

const jira = {
  read: () =>
    issueRefused ? Promise.reject(new JiraError('Not found', 404)) : Promise.resolve(ISSUE_BODY),
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
  issueRefused = false;
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
    issue: {
      summary: 'Dark mode',
      type: 'Story',
      status: { name: 'In Review', category: 'indeterminate' },
      assignee: null,
      updatedAt: '2026-11-12T10:00:00.000+0100',
    },
    comments: [COMMENT],
    total: 1,
    pending: [],
    review: { importedIds: [], refusal: 'Available once the ticket is implemented' },
  });
  expect(asked).toEqual([{ token: 'tok', key: 'ABC-1' }]);
});

test('an issue Jira does not give leaves its card empty; the comments still show', async () => {
  issueRefused = true;
  const view = (await (await read(jiraTicket())).json()) as { issue: unknown; comments: unknown[] };
  expect(view.issue).toBeNull();
  expect(view.comments).toEqual([COMMENT]);
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

function post(ticketId: number, body: unknown): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/jira-comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a comment is queued for the worker and shown pending until it is posted', async () => {
  const ticketId = jiraTicket();
  const replyTo = { commentId: '10010', accountId: '557058:ada', name: 'Ada Lovelace' };
  const queued = await post(ticketId, { text: ' Done, see the PR ', replyTo });
  expect(queued.status).toBe(202);
  const { id } = (await queued.json()) as { id: number };
  const command = db.select().from(schema.commands).get();
  expect(command).toMatchObject({
    type: 'post_jira_comment',
    ticketId,
    payload: { projectId, ticketId, key: 'ABC-1', text: 'Done, see the PR', replyTo },
  });
  const pending = (await (await read(ticketId)).json()) as { pending: unknown[] };
  expect(pending.pending).toMatchObject([
    { commandId: id, replyTo: '10010', text: 'Done, see the PR' },
  ]);
  emitEvent(db, {
    type: 'jira_comment_posted',
    ticketId,
    payload: { commandId: id, commentId: '10200' },
  });
  const posted = (await (await read(ticketId)).json()) as { pending: unknown[] };
  expect(posted.pending).toEqual([]);
});

test('an empty comment, or one on a ticket not from Jira, is refused', async () => {
  const empty = await post(jiraTicket(), { text: '  ' });
  expect(empty.status).toBe(400);
  expect(await empty.json()).toEqual({ error: 'Write a comment first' });
  const written = createTicket(db, { projectId, title: 'Written in Union' }).id;
  expect((await post(written, { text: 'Hi' })).status).toBe(409);
  expect(db.select().from(schema.commands).all()).toEqual([]);
});

function importComment(ticketId: number, commentId: string): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/jira-comments/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commentId }),
  });
}

test('a comment goes into the review once the ticket is implemented, once, read again from Jira', async () => {
  const ticketId = jiraTicket();
  const early = await importComment(ticketId, '10010');
  expect(early.status).toBe(409);
  expect(await early.json()).toEqual({ error: 'Available once the ticket is implemented' });
  db.update(schema.tickets)
    .set({ branch: 'union/1-dark-mode' })
    .where(eq(schema.tickets.id, ticketId))
    .run();

  expect(await (await importComment(ticketId, '10010')).json()).toEqual({ imported: true });
  expect(await (await importComment(ticketId, '10010')).json()).toEqual({ imported: false });
  expect(db.select().from(schema.reviewComments).all()).toMatchObject([
    {
      ticketId,
      kind: 'general',
      body: '**Ada Lovelace** commented on the Jira issue:\n\nIs it CSV or XLSX?',
      sourceUrl: COMMENT.url,
    },
  ]);
  const view = (await (await read(ticketId)).json()) as { review: unknown };
  expect(view.review).toEqual({ importedIds: ['10010'], refusal: null });
  expect((await importComment(ticketId, '99')).status).toBe(404);

  db.update(schema.tickets).set({ prState: 'merged' }).where(eq(schema.tickets.id, ticketId)).run();
  expect((await importComment(ticketId, '10010')).status).toBe(409);
});
