import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  JiraError,
  migrateDb,
  schema,
  type Db,
  type JiraApi,
  type JiraAuth,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import type { PublicProject, SourceImport } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const root = await mkdtemp(path.join(tmpdir(), 'union-jira-routes-'));
process.env.UNION_ATTACHMENTS_DIR = root;

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const SITE = 'https://acme.atlassian.net';
const SCREEN = { id: '10', filename: 'screen.png', mimeType: 'image/png', content: '' };
const PNG = new Uint8Array([137, 80, 78, 71]);
const CONFIG = { site: 'acme', email: 'ada@acme.com', projectKey: 'abc' };
const JIRA = { kind: 'jira', secret: 'token-ok', config: CONFIG };

function allowed(auth: JiraAuth): Promise<void> {
  return auth.token === 'token-ok' && auth.site === SITE
    ? Promise.resolve()
    : Promise.reject(new JiraError('Jira rejected this email and API token.', 401));
}

const jira: JiraApi = {
  myself: async (auth) => {
    await allowed(auth);
    return { accountId: '557058:1', displayName: 'Ada' };
  },
  project: async (auth, key) => {
    await allowed(auth);
    if (key !== 'ABC') {
      throw new JiraError('Not found, or not visible to this Jira account.', 404);
    }
    return { key, name: 'Apollo', issueTypes: [] };
  },
  statuses: () => Promise.resolve([{ id: '1', name: 'To Do', category: 'new' }]),
  attachmentMediaId: () => Promise.resolve(null),
  issue: async (auth, key) => {
    await allowed(auth);
    const description = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A dark theme.' }] }],
    };
    return {
      key,
      summary: 'Add dark mode',
      projectKey: key.split('-')[0] ?? '',
      description,
      // ABC-5 has a screenshot the text does not show: it is listed, then kept as a ticket file.
      attachments: key === 'ABC-5' ? [SCREEN] : [],
    };
  },
};

let db: Db;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi, { jira });
});

function send(method: string, apiPath: string, body?: unknown): Response | Promise<Response> {
  const init = { method, headers: { 'content-type': 'application/json' } };
  return app.request(apiPath, body === undefined ? init : { ...init, body: JSON.stringify(body) });
}

function verify(secret: string, config: unknown): Response | Promise<Response> {
  return send('POST', '/api/integrations/jira/verify', { secret, config });
}

/** A project created connected to Jira. */
async function jiraProject(): Promise<PublicProject> {
  const response = await send('POST', '/api/projects', {
    owner: 'o',
    repo: 'r',
    githubProjectNodeId: 'P',
    integrations: [JIRA],
  });
  return (await response.json()) as PublicProject;
}

test('verify checks the token and project, and normalizes the config', async () => {
  const ok = await verify('token-ok', CONFIG);
  expect(await ok.json()).toEqual({
    title: 'Apollo',
    config: { site: SITE, email: 'ada@acme.com', projectKey: 'ABC' },
  });
  expect((await verify('bad', CONFIG)).status).toBe(401);
  expect((await verify('token-ok', { ...CONFIG, projectKey: 'XYZ' })).status).toBe(404);
  const elsewhere = await verify('token-ok', { ...CONFIG, site: 'jira.acme.com' });
  expect(elsewhere.status).toBe(400);
  expect(await elsewhere.json()).toEqual({
    error: 'The Jira site is its https://<name>.atlassian.net address',
  });
});

test('a project connects to Jira without the token reaching the browser', async () => {
  const created = await jiraProject();
  expect(JSON.stringify(created)).not.toContain('token-ok');
  const base = `/api/projects/${created.id}/integrations/jira`;
  const saved = await send('PUT', base, { config: CONFIG });
  expect(await saved.json()).toMatchObject({ kind: 'jira', title: 'Apollo', ready: true });
  expect(db.select().from(schema.integrations).get()).toMatchObject({
    secret: 'token-ok',
    fields: { projectName: 'Apollo', statuses: [{ name: 'To Do' }] },
  });
  expect((await send('PUT', base, { secret: 'bad', config: CONFIG })).status).toBe(401);
  expect(db.select().from(schema.integrations).get()?.secret).toBe('token-ok');
});

test('an issue of the project is imported by key or link, and becomes the ticket origin', async () => {
  const created = await jiraProject();
  const importIssue = (ref: string): Response | Promise<Response> =>
    send('POST', `/api/projects/${created.id}/integrations/jira/import`, { ref });
  const imported = (await (await importIssue('abc-1')).json()) as SourceImport;
  expect(imported).toEqual({
    title: 'Add dark mode',
    body: `A dark theme.\n\n---\nImported from Jira: ${SITE}/browse/ABC-1`,
    url: `${SITE}/browse/ABC-1`,
    truncated: false,
    id: 'ABC-1',
  });
  expect(
    (await importIssue(`${SITE}/jira/software/projects/ABC/boards/1?selectedIssue=ABC-1`)).status,
  ).toBe(200);
  const otherSite = await importIssue('https://other.atlassian.net/browse/ABC-1');
  expect(otherSite.status).toBe(400);
  expect(await otherSite.json()).toEqual({
    error: `That link is not on the project's Jira site (${SITE})`,
  });
  expect((await importIssue('XYZ-2')).status).toBe(409);
  expect((await importIssue('not a key')).status).toBe(400);

  const ticket = await send('POST', '/api/tickets', {
    projectId: created.id,
    title: imported.title,
    body: imported.body,
    origin: { kind: 'jira', id: imported.id, url: imported.url },
  });
  expect(await ticket.json()).toMatchObject({
    originKind: 'jira',
    originId: 'ABC-1',
    originUrl: `${SITE}/browse/ABC-1`,
  });
});

test("a ticket made from an import keeps the issue's attachments as its files", async () => {
  const created = await jiraProject();
  const imported = (await (
    await send('POST', `/api/projects/${created.id}/integrations/jira/import`, { ref: 'ABC-5' })
  ).json()) as SourceImport;
  const url = `${SITE}/rest/api/3/attachment/content/10`;
  expect(imported.body).toContain(`## Attachments\n\n- ![screen.png](${url})`);
  const realFetch = globalThis.fetch;
  const asked: (string | null)[] = [];
  globalThis.fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      asked.push(new Headers(init?.headers).get('authorization'));
      const target = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(
        target === url
          ? new Response(PNG, { headers: { 'content-type': 'image/png' } })
          : new Response('gone', { status: 404 }),
      );
    },
    { preconnect: realFetch.preconnect },
  );
  try {
    const response = await send('POST', '/api/tickets', {
      projectId: created.id,
      title: imported.title,
      body: imported.body,
      origin: { kind: 'jira', id: imported.id, url: imported.url },
    });
    expect(response.status).toBe(201);
  } finally {
    globalThis.fetch = realFetch;
  }
  expect(asked).toEqual([`Basic ${Buffer.from('ada@acme.com:token-ok').toString('base64')}`]);
  expect(db.select().from(schema.tickets).get()?.body).toContain(
    '- ![screen.png](attachment:screen.png)',
  );
  const files = db.select().from(schema.ticketAttachments).all();
  expect(files.map(({ name, note }) => [name, note])).toEqual([
    ['screen.png', 'An image of the Jira issue'],
  ]);
});
