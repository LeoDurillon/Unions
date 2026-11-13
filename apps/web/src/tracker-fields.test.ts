// Tests the ticket's tracker-fields route: a Notion property checked then queued, refusals, and "Saving…" in the tab.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  saveNotionConnection,
  schema,
  setTicketOrigin,
  type Db,
  type NotionApi,
  type TrackerProperty,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import type { NotionTabView } from './notion-discussion-types';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function property(id: string, type: string, settable = true): TrackerProperty {
  return { id, name: id.toUpperCase(), type, text: '', value: '', options: [], settable };
}

const PROPERTIES = [
  property('prio', 'select'),
  property('pts', 'number'),
  property('f', 'formula', false),
];

const notion = {
  page: () =>
    Promise.resolve({
      id: PAGE,
      title: 'Export',
      url: '',
      dataSourceId: null,
      properties: PROPERTIES,
    }),
  pageMarkdown: () => Promise.resolve({ markdown: '', truncated: false }),
  comments: () => Promise.resolve([]),
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, notion);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: '' }).id;
  setTicketOrigin(db, ticketId, { kind: 'notion', id: PAGE, url: `https://www.notion.so/${PAGE}` });
});

function set(body: object): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/tracker-fields`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function tab(): Promise<NotionTabView> {
  return (await (
    await app.request(`/api/tickets/${ticketId}/notion-comments`)
  ).json()) as NotionTabView;
}

test('a property is checked against the page, queued for the worker, and shown saving', async () => {
  const response = await set({ fieldId: 'prio', value: ' P1 ', text: 'P1' });
  expect(response.status).toBe(202);
  const { id } = (await response.json()) as { id: number };
  const command = db.select().from(schema.commands).all().at(-1);
  expect(command).toMatchObject({
    id,
    type: 'set_tracker_fields',
    ticketId,
    payload: {
      kind: 'notion',
      itemId: PAGE,
      ticketId,
      field: { id: 'prio', name: 'PRIO', type: 'select' },
      value: 'P1',
      text: 'P1',
    },
  });
  expect(
    (await tab()).pendingFields.map((change) => [change.commandId, change.fieldId, change.text]),
  ).toEqual([[id, 'prio', 'P1']]);
  emitEvent(db, {
    type: 'tracker_field_set',
    ticketId,
    payload: {
      commandId: id,
      kind: 'notion',
      itemId: PAGE,
      reviewId: null,
      fieldId: 'prio',
      fieldName: 'PRIO',
      text: 'P1',
    },
  });
  expect((await tab()).pendingFields).toEqual([]);
});

test('a value Notion cannot take, a property Union cannot set or one gone are refused', async () => {
  const wrong = await set({ fieldId: 'pts', value: 'many' });
  expect(wrong.status).toBe(400);
  expect(await wrong.text()).toContain('is not a number');
  expect((await set({ fieldId: 'f', value: '1' })).status).toBe(400);
  expect((await set({ fieldId: 'gone', value: '1' })).status).toBe(404);
  expect(db.select().from(schema.commands).all()).toEqual([]);
});

test('a ticket without a Notion page is refused', async () => {
  setTicketOrigin(db, ticketId, null);
  expect((await set({ fieldId: 'prio', value: 'P1' })).status).toBe(409);
});
