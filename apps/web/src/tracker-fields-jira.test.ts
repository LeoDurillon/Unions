// Tests setting a Jira issue's field from the ticket's tab: checked against the issue, the status by its transitions.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
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

const ISSUE_BODY = {
  fields: { status: { name: 'To Do' }, labels: [], priority: { name: 'High' } },
  editmeta: {
    fields: {
      labels: { name: 'Labels', schema: { type: 'array', items: 'string', system: 'labels' } },
      priority: { name: 'Priority', schema: { type: 'priority', system: 'priority' } },
    },
  },
};

const jira = {
  read: () => Promise.resolve(ISSUE_BODY),
  transitions: () =>
    Promise.resolve([{ id: '31', name: 'Start', toId: '3', toName: 'In Progress' }]),
} satisfies Partial<JiraApi> as unknown as JiraApi;

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi, { jira });
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const config = { site: SITE, email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  ticketId = createTicket(db, {
    projectId,
    title: 'Dark mode',
    origin: { kind: 'jira', id: 'ABC-1', url: `${SITE}/browse/ABC-1` },
  }).id;
});

function set(body: object): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/tracker-fields`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a field of the edit screen is checked, then queued with the issue’s key', async () => {
  expect((await set({ fieldId: 'labels', value: 'to do' })).status).toBe(400);
  const response = await set({ fieldId: 'labels', value: 'ui, qa', text: 'ui, qa' });
  expect(response.status).toBe(202);
  expect(db.select().from(schema.commands).all().at(-1)?.payload).toMatchObject({
    kind: 'jira',
    itemId: 'ABC-1',
    field: { id: 'labels', type: 'labels' },
    value: 'ui, qa',
  });
  expect((await set({ fieldId: 'priority', value: 'Low' })).status).toBe(400);
});

test('the status takes one of the transitions the issue offers now', async () => {
  const moves = await app.request(`/api/tickets/${ticketId}/trackers/jira/moves`);
  expect(await moves.json()).toEqual([{ id: '31', name: 'Start', toName: 'In Progress' }]);
  expect((await set({ fieldId: 'status', value: '', picks: [{ id: '99' }] })).status).toBe(400);
  const moved = await set({
    fieldId: 'status',
    value: '',
    text: 'In Progress',
    picks: [{ id: '31', name: 'In Progress' }],
  });
  expect(moved.status).toBe(202);
  expect(db.select().from(schema.commands).all().at(-1)?.payload).toMatchObject({
    field: { id: 'status' },
    picks: [{ id: '31', name: 'In Progress' }],
  });
});
