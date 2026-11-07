// Tests Jira issues as review specs: read from Jira, any issue of the site, and a Jira ticket's starting specs.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
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
let ticketId: number;
let asked: string[];

const description = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Done when' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Names keep their accents.' }] },
  ],
};

const jira = {
  issue: (_auth, key) => {
    asked.push(key);
    if (key === 'ABC-404') {
      return Promise.reject(new JiraError('Not found, or not visible to this Jira account.', 404));
    }
    const [projectKey = ''] = key.split('-');
    return Promise.resolve({
      key,
      summary: 'Keep accents',
      projectKey,
      description,
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
  ticketId = createTicket(db, {
    projectId,
    title: 'Keep accents',
    body: 'The export drops accents.',
    origin: { kind: 'jira', id: 'ABC-12', url: `${SITE}/browse/ABC-12` },
  }).id;
  asked = [];
});

function source(ref: string): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/groupings/source`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'jira', ref }),
  });
}

test("a Jira issue's spec is its description, read from Jira, even of another project of the site", async () => {
  expect(await (await source('XYZ-3')).json()).toEqual({
    kind: 'jira',
    label: 'Jira: XYZ-3 Keep accents',
    text: '## Done when\n\nNames keep their accents.',
    url: `${SITE}/browse/XYZ-3`,
  });
  expect(asked).toEqual(['XYZ-3']);
});

test('a link of another site, no key, a missing issue or a project not connected is refused', async () => {
  expect((await source('https://other.atlassian.net/browse/ABC-1')).status).toBe(400);
  expect((await source('accents')).status).toBe(400);
  expect((await source('ABC-404')).status).toBe(404);
  db.delete(schema.integrations).run();
  const unconnected = await source('ABC-12');
  expect(unconnected.status).toBe(409);
  expect(asked).toEqual(['ABC-404']);
});

test("a Jira ticket's specs start with its description and its issue, read from Jira", async () => {
  const response = await app.request(`/api/tickets/${ticketId}/specs`);
  const specs = (await response.json()) as {
    kind: string;
    label: string;
    current: string;
    error: null;
  }[];
  expect(specs.map(({ kind, label, current, error }) => ({ kind, label, current, error }))).toEqual(
    [
      {
        kind: 'ticket',
        label: 'Ticket description',
        current: 'The export drops accents.',
        error: null,
      },
      {
        kind: 'jira',
        label: 'Jira: ABC-12 Keep accents',
        current: '## Done when\n\nNames keep their accents.',
        error: null,
      },
    ],
  );
  expect(asked).toEqual(['ABC-12']);
});
