import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, NotionError, schema, type Db, type NotionApi } from '@union/core';
import type { Hono } from 'hono';

import type { NotionImport, PublicProject } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const SOURCE = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FOREIGN = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const notion: NotionApi = {
  dataSourceTitle: (token, id) => {
    if (token !== 'secret_ok') {
      return Promise.reject(new NotionError('Notion rejected this token.', 401));
    }
    return id === SOURCE
      ? Promise.resolve('Roadmap')
      : Promise.reject(new NotionError('Not found', 404));
  },
  page: (_token, id) =>
    Promise.resolve({
      id,
      title: 'Add dark mode',
      url: `https://www.notion.so/${id.replaceAll('-', '')}`,
      dataSourceId: id === PAGE ? SOURCE : OTHER,
    }),
  pageMarkdown: () => Promise.resolve({ markdown: '## Goal\n\nA dark theme.', truncated: false }),
  dataSource: (token, id) =>
    token === 'secret_ok' && id === SOURCE
      ? Promise.resolve({
          title: 'Roadmap',
          properties: [
            { id: 'p%3Ar', name: 'PR', type: 'url', options: [] },
            { id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'Done'] },
          ],
        })
      : Promise.reject(new NotionError('Not found', 404)),
  updatePage: () => Promise.resolve(),
  users: () => Promise.resolve([{ id: '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e', name: 'Ada' }]),
};

const github = {} as OnboardingGitHub;
let db: Db;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, notion);
});

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function project(notionFields: Record<string, string> = {}): Promise<PublicProject> {
  const response = await call('POST', '/api/projects', {
    owner: 'o',
    repo: 'r',
    githubProjectNodeId: 'P',
    ...notionFields,
  });
  return (await response.json()) as PublicProject;
}

test('verify checks the token and the data source, accepting a URL', async () => {
  const ok = await call('POST', '/api/notion/verify', {
    token: 'secret_ok',
    dataSourceId: `https://www.notion.so/${SOURCE.replaceAll('-', '')}?v=1`,
  });
  expect(await ok.json()).toEqual({ dataSourceId: SOURCE, title: 'Roadmap' });
  expect(
    (await call('POST', '/api/notion/verify', { token: 'bad', dataSourceId: SOURCE })).status,
  ).toBe(401);
  expect(
    (await call('POST', '/api/notion/verify', { token: 'secret_ok', dataSourceId: OTHER })).status,
  ).toBe(404);
  expect(
    (await call('POST', '/api/notion/verify', { token: 'secret_ok', dataSourceId: 'nope' })).status,
  ).toBe(400);
});

test('a project stores the Notion connection, never returning the token', async () => {
  const created = await project({
    notionToken: 'secret_ok',
    notionDataSourceId: SOURCE.replaceAll('-', ''),
  });
  expect(created).toMatchObject({ hasNotion: true, config: { notionDataSourceId: SOURCE } });
  expect(JSON.stringify(created)).not.toContain('secret_ok');
  expect(db.select().from(schema.projects).get()?.notionToken).toBe('secret_ok');
  const half = await call('POST', '/api/projects', {
    owner: 'o',
    repo: 'x',
    githubProjectNodeId: 'P',
    notionToken: 't',
  });
  expect(half.status).toBe(400);
});

test('import returns a preview of a page from the data source, and refuses other pages', async () => {
  const created = await project({ notionToken: 'secret_ok', notionDataSourceId: SOURCE });
  const preview = await call('POST', '/api/notion/import', { projectId: created.id, page: PAGE });
  const body = (await preview.json()) as NotionImport;
  expect(body.title).toBe('Add dark mode');
  expect(body.body).toContain('## Goal');
  expect(body.body).toContain('Imported from Notion: https://www.notion.so/');
  const foreign = await call('POST', '/api/notion/import', {
    projectId: created.id,
    page: FOREIGN,
  });
  expect(foreign.status).toBe(409);
});

test('import needs a connected project; settings can connect and disconnect', async () => {
  const created = await project();
  expect(
    (await call('POST', '/api/notion/import', { projectId: created.id, page: PAGE })).status,
  ).toBe(409);
  await call('PATCH', `/api/projects/${created.id}`, {
    notionToken: 'secret_ok',
    notionDataSourceId: SOURCE,
  });
  expect(
    (await call('POST', '/api/notion/import', { projectId: created.id, page: PAGE })).status,
  ).toBe(200);
  const cleared = await call('PATCH', `/api/projects/${created.id}`, {
    notionToken: '',
    notionDataSourceId: '',
  });
  expect(await cleared.json()).toMatchObject({ hasNotion: false });
  expect(db.select().from(schema.projects).get()?.notionToken).toBeNull();
});

test('event rules use the stored Notion columns; a ticket from an import previews its value', async () => {
  const created = await project();
  const base = `/api/projects/${created.id}`;
  expect((await call('POST', `${base}/notion/schema`)).status).toBe(409);
  expect((await call('GET', `${base}/notion/users`)).status).toBe(409);
  await call('PATCH', base, { notionToken: 'secret_ok', notionDataSourceId: SOURCE });
  expect(await (await call('GET', `${base}/notion/users`)).json()).toEqual([
    { id: '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e', name: 'Ada' },
  ]);
  expect(await (await call('POST', `${base}/notion/schema`)).json()).toMatchObject({
    title: 'Roadmap',
    properties: [{ name: 'PR' }, { name: 'Status' }],
  });

  const rule = {
    name: 'PR link',
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'notion_property', propertyId: 'p%3Ar', value: '{pr.link}' },
  };
  const refused = await call('POST', `${base}/event-rules`, rule);
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: 'Unknown variable: {pr.link}' });
  const saved = await call('POST', `${base}/event-rules`, {
    ...rule,
    action: { ...rule.action, value: '{pr.url}' },
  });
  expect(saved.status).toBe(201);
  expect(await (await call('GET', `${base}/event-rules`)).json()).toMatchObject({
    rules: [{ name: 'PR link', enabled: true }],
    hasNotion: true,
  });

  // The import's page is linked to the ticket made from it.
  const imported = (await (
    await call('POST', '/api/notion/import', { projectId: created.id, page: PAGE })
  ).json()) as NotionImport;
  const ticket = (await (
    await call('POST', '/api/tickets', {
      projectId: created.id,
      title: imported.title,
      body: imported.body,
      notionPageId: imported.pageId,
    })
  ).json()) as { id: number; notionPageId: string };
  expect(ticket.notionPageId).toBe(PAGE);
  db.update(schema.tickets).set({ prNumber: 12 }).run();
  const preview = await call('POST', `${base}/event-rules/preview`, {
    ...rule,
    action: { ...rule.action, value: '{pr.url}' },
    ticketId: ticket.id,
  });
  expect(await preview.json()).toEqual({
    ok: true,
    property: 'PR',
    pageId: PAGE,
    text: 'https://github.com/o/r/pull/12',
    value: { url: 'https://github.com/o/r/pull/12' },
  });

  // Another data source: the stored columns no longer apply.
  await call('PATCH', base, { notionToken: '', notionDataSourceId: '' });
  expect(await (await call('GET', `${base}/event-rules`)).json()).toMatchObject({ notion: null });
});
