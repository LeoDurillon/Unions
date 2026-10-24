import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, NotionError, schema, type Db, type NotionApi } from '@union/core';
import type { Hono } from 'hono';

import type { PublicProject, SourceImport } from './api-types';
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
  createPage: () => Promise.reject(new NotionError('Not used', 400)),
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

const NOTION = { kind: 'notion', secret: 'secret_ok', config: { dataSourceId: SOURCE } };

async function project(integrations: unknown[] = []): Promise<PublicProject> {
  const response = await call('POST', '/api/projects', {
    owner: 'o',
    repo: 'r',
    githubProjectNodeId: 'P',
    integrations,
  });
  return (await response.json()) as PublicProject;
}

function verify(secret: string, dataSourceId: string): Response | Promise<Response> {
  return call('POST', '/api/integrations/notion/verify', { secret, config: { dataSourceId } });
}

function importPage(projectId: number, ref: string): Response | Promise<Response> {
  return call('POST', `/api/projects/${projectId}/integrations/notion/import`, { ref });
}

test('verify checks the secret and the data source, accepting a URL', async () => {
  const ok = await verify('secret_ok', `https://www.notion.so/${SOURCE.replaceAll('-', '')}?v=1`);
  expect(await ok.json()).toEqual({ title: 'Roadmap', config: { dataSourceId: SOURCE } });
  expect((await verify('bad', SOURCE)).status).toBe(401);
  expect((await verify('secret_ok', OTHER)).status).toBe(404);
  expect((await verify('secret_ok', 'nope')).status).toBe(400);
  expect(
    (await call('POST', '/api/integrations/jira/verify', { secret: 's', config: {} })).status,
  ).toBe(404);
});

test('a project is created with its integrations, never returning the secret', async () => {
  const created = await project([
    { ...NOTION, config: { dataSourceId: SOURCE.replaceAll('-', '') } },
  ]);
  expect(created.integrations).toEqual([
    {
      kind: 'notion',
      title: '',
      ready: true,
      config: { dataSourceId: SOURCE },
      fieldsReadAt: null,
    },
  ]);
  expect(JSON.stringify(created)).not.toContain('secret_ok');
  expect(db.select().from(schema.integrations).get()?.secret).toBe('secret_ok');
  const half = await call('POST', '/api/projects', {
    owner: 'o',
    repo: 'x',
    githubProjectNodeId: 'P',
    integrations: [{ kind: 'notion', secret: 't', config: {} }],
  });
  expect(half.status).toBe(400);
  // Refused before anything is written.
  expect(db.select().from(schema.projects).all()).toHaveLength(1);
});

test('import returns a preview of a page from the data source, and refuses other pages', async () => {
  const created = await project([NOTION]);
  const preview = await importPage(created.id, PAGE);
  const body = (await preview.json()) as SourceImport;
  expect(body).toMatchObject({ title: 'Add dark mode', id: PAGE });
  expect(body.body).toContain('## Goal');
  expect(body.body).toContain('Imported from Notion: https://www.notion.so/');
  expect((await importPage(created.id, FOREIGN)).status).toBe(409);
  expect((await importPage(created.id, 'not a page')).status).toBe(400);
});

test('import needs a connected project; settings connect, keep the secret, and disconnect', async () => {
  const created = await project();
  const base = `/api/projects/${created.id}/integrations/notion`;
  expect((await importPage(created.id, PAGE)).status).toBe(409);
  expect((await call('PUT', base, { config: { dataSourceId: SOURCE } })).status).toBe(400);
  // Notion refuses the bad secret (the fake answers 404 to any column read it refuses).
  expect((await call('PUT', base, { secret: 'bad', config: { dataSourceId: SOURCE } })).ok).toBe(
    false,
  );
  expect(db.select().from(schema.integrations).all()).toEqual([]);

  const saved = await call('PUT', base, { secret: 'secret_ok', config: { dataSourceId: SOURCE } });
  expect(await saved.json()).toMatchObject({ kind: 'notion', title: 'Roadmap', ready: true });
  expect((await importPage(created.id, PAGE)).status).toBe(200);
  // No secret: the stored one is kept.
  expect((await call('PUT', base, { config: { dataSourceId: SOURCE } })).status).toBe(200);
  expect(db.select().from(schema.integrations).get()?.secret).toBe('secret_ok');

  expect((await call('DELETE', base)).status).toBe(200);
  const listed = (await (await call('GET', '/api/projects')).json()) as PublicProject[];
  expect(listed[0]?.integrations).toEqual([]);
  expect((await call('PUT', '/api/projects/99/integrations/notion', NOTION)).status).toBe(404);
});

test('event rules use the stored Notion columns; a ticket from an import previews its value', async () => {
  const created = await project();
  const base = `/api/projects/${created.id}`;
  const fields = `${base}/integrations/notion/fields`;
  expect((await call('POST', fields)).status).toBe(409);
  expect((await call('GET', `${base}/notion/users`)).status).toBe(409);
  await call('PUT', `${base}/integrations/notion`, NOTION);
  expect(await (await call('GET', `${base}/notion/users`)).json()).toEqual([
    { id: '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e', name: 'Ada' },
  ]);
  expect(await (await call('POST', fields)).json()).toMatchObject({ title: 'Roadmap' });
  expect(await (await call('GET', `${base}/event-rules`)).json()).toMatchObject({
    notion: { title: 'Roadmap', properties: [{ name: 'PR' }, { name: 'Status' }] },
  });

  const rule = {
    name: 'PR link',
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'notion_property', values: [{ propertyId: 'p%3Ar', value: '{pr.link}' }] },
  };
  const refused = await call('POST', `${base}/event-rules`, rule);
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: 'PR: Unknown variable: {pr.link}' });
  const saved = await call('POST', `${base}/event-rules`, {
    ...rule,
    action: { ...rule.action, values: [{ propertyId: 'p%3Ar', value: '{pr.url}' }] },
  });
  expect(saved.status).toBe(201);
  expect(await (await call('GET', `${base}/event-rules`)).json()).toMatchObject({
    rules: [{ name: 'PR link', enabled: true }],
    hasNotion: true,
  });

  // The import's page is linked to the ticket made from it.
  const imported = (await (await importPage(created.id, PAGE)).json()) as SourceImport;
  const newTicket = (origin: unknown): Response | Promise<Response> =>
    call('POST', '/api/tickets', {
      projectId: created.id,
      title: imported.title,
      body: imported.body,
      origin,
    });
  const origin = { kind: 'notion', id: imported.id, url: imported.url };
  expect((await newTicket({ ...origin, kind: 'jira' })).status).toBe(400);
  expect((await newTicket({ ...origin, id: 'nope' })).status).toBe(400);
  expect((await newTicket({ ...origin, url: 'http://www.notion.so/x' })).status).toBe(400);
  const ticket = (await (await newTicket(origin)).json()) as {
    id: number;
    originKind: string;
    originId: string;
    originUrl: string;
  };
  expect(ticket).toMatchObject({ originKind: 'notion', originId: PAGE, originUrl: imported.url });
  db.update(schema.tickets).set({ prNumber: 12 }).run();
  const preview = await call('POST', `${base}/event-rules/preview`, {
    ...rule,
    action: {
      kind: 'notion_property',
      values: [
        { propertyId: 'p%3Ar', value: '{pr.url}' },
        { propertyId: 's%3At', value: 'Done' },
      ],
    },
    ticketId: ticket.id,
  });
  expect(await preview.json()).toEqual({
    ok: true,
    kind: 'notion_property',
    pageId: PAGE,
    properties: [
      {
        name: 'PR',
        text: 'https://github.com/o/r/pull/12',
        value: { url: 'https://github.com/o/r/pull/12' },
      },
      { name: 'Status', text: 'Done', value: { status: { name: 'Done' } } },
    ],
  });

  // Disconnected: the stored columns go with the integration.
  await call('DELETE', `${base}/integrations/notion`);
  expect(await (await call('GET', `${base}/event-rules`)).json()).toMatchObject({ notion: null });
});
