// Tests linking a ticket to a Jira issue after creation, and that a ticket keeps one tracker's origin.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  JiraError,
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
let projectId: number;

const jira = {
  issue: (_auth, key) => {
    if (key === 'ABC-404') {
      return Promise.reject(new JiraError('Not found, or not visible to this Jira account.', 404));
    }
    const [projectKey = ''] = key.split('-');
    return Promise.resolve({
      key,
      summary: 'Dark mode',
      projectKey,
      description: null,
      attachments: [],
    });
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
  saveIntegration(db, projectId, 'jira', {
    secret: 'tok',
    config: { site: SITE, email: 'a@b.c', projectKey: 'ABC' },
  });
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  const init = { method, headers: { 'content-type': 'application/json' } };
  return app.request(path, body === undefined ? init : { ...init, body: JSON.stringify(body) });
}

function written(): number {
  return createTicket(db, { projectId, title: 'Written in Union' }).id;
}

test('a ticket written in Union is linked to an issue of the project, and unlinked', async () => {
  const id = written();
  const checked = await send('POST', `/api/tickets/${id}/jira/check`, {
    issue: `${SITE}/browse/abc-12`,
  });
  expect(await checked.json()).toEqual({
    key: 'ABC-12',
    title: 'Dark mode',
    url: `${SITE}/browse/ABC-12`,
  });
  expect(getTicket(db, id).originKind).toBeNull();
  expect((await send('PUT', `/api/tickets/${id}/jira`, { issue: 'ABC-12' })).status).toBe(200);
  expect(getTicket(db, id)).toMatchObject({
    originKind: 'jira',
    originId: 'ABC-12',
    originUrl: `${SITE}/browse/ABC-12`,
  });
  expect((await send('DELETE', `/api/tickets/${id}/jira`)).status).toBe(200);
  expect(getTicket(db, id)).toMatchObject({ originKind: null, originId: null });
});

test('an issue of another project or site, a missing one, or no key is refused', async () => {
  const id = written();
  const check = (issue: string): Response | Promise<Response> =>
    send('POST', `/api/tickets/${id}/jira/check`, { issue });
  expect((await check('XYZ-1')).status).toBe(409);
  const otherSite = await check('https://other.atlassian.net/browse/ABC-1');
  expect(otherSite.status).toBe(400);
  expect(await otherSite.json()).toEqual({
    error: `That link is not on the project's Jira site (${SITE})`,
  });
  expect((await check('ABC-404')).status).toBe(404);
  expect((await check('dark mode')).status).toBe(400);
  db.delete(schema.integrations).run();
  expect(await (await check('ABC-12')).json()).toEqual({
    error: 'The project is not connected to Jira',
  });
});

test('a ticket keeps one origin: linking the other tracker, or unlinking its item, is refused', async () => {
  const fromNotion = createTicket(db, {
    projectId,
    title: 'From Notion',
    origin: {
      kind: 'notion',
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      url: 'https://www.notion.so/x',
    },
  }).id;
  const toJira = await send('PUT', `/api/tickets/${fromNotion}/jira`, { issue: 'ABC-12' });
  expect(toJira.status).toBe(409);
  expect(await toJira.json()).toEqual({
    error: 'This ticket comes from Notion: unlink its Notion page first',
  });
  expect((await send('DELETE', `/api/tickets/${fromNotion}/jira`)).status).toBe(409);
  expect(getTicket(db, fromNotion).originKind).toBe('notion');

  const fromJira = written();
  await send('PUT', `/api/tickets/${fromJira}/jira`, { issue: 'ABC-12' });
  const toNotion = await send('PUT', `/api/tickets/${fromJira}/notion`, {
    page: 'https://www.notion.so/x',
  });
  expect(await toNotion.json()).toEqual({
    error: 'This ticket comes from Jira: unlink its Jira issue first',
  });
  expect((await send('DELETE', `/api/tickets/${fromJira}/notion`)).status).toBe(409);
  expect(getTicket(db, fromJira).originKind).toBe('jira');
});
