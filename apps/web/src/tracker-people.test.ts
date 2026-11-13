import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  NotionError,
  saveNotionConnection,
  schema,
  setTicketOrigin,
  type Db,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAGE_URL = 'https://www.notion.so/Export-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee';

let refuse = false;

const notion = {
  users: () =>
    refuse
      ? Promise.reject(new NotionError('Insufficient permissions', 403))
      : Promise.resolve([
          { id: 'u-1', name: 'Ada Lovelace' },
          { id: 'u-2', name: 'Grace Hopper' },
        ]),
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  refuse = false;
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, notion);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: 'As written' }).id;
  setTicketOrigin(db, ticketId, { kind: 'notion', id: PAGE, url: PAGE_URL });
});

function people(query: string): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/trackers/notion/comments/people?q=${query}`);
}

test('the people a comment can tag, matched on the start of a name', async () => {
  const response = await people('hop');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ id: 'u-2', name: 'Grace Hopper' }]);
});

test('without the capability, says which one to turn on', async () => {
  refuse = true;
  const response = await people('a');
  expect(response.status).toBe(409);
  expect(await response.text()).toContain('Read user information');
});
