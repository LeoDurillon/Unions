// Tests GitHub Project fields rules over the API: saved and previewed for one ticket, and the fields read from GitHub.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db, type NotionApi } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

let db: Db;
let app: Hono;
let projectId: number;
let asked: string[];

const FIELDS = [{ id: 'F_sprint', name: 'Sprint', type: 'number', options: [] }];

const github = {
  listProjectFields: (_auth, projectNodeId) => {
    asked.push(projectNodeId);
    return Promise.resolve(FIELDS);
  },
} as Pick<OnboardingGitHub, 'listProjectFields'> as OnboardingGitHub;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, {} as NotionApi);
  asked = [];
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubToken: 'tok',
      githubProjectNodeId: 'P_1',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get().id;
});

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const RULE = {
  name: 'Sprint',
  trigger: { kind: 'pull_request_linked' },
  action: {
    kind: 'github_project_fields',
    item: 'issue',
    values: [
      { fieldId: 'F_sprint', fieldName: 'Sprint', fieldType: 'number', value: '{pr.number}' },
    ],
  },
};

test('a Project fields rule is saved, Status on the issue refused, and previewed', async () => {
  const base = `/api/projects/${projectId}`;
  expect((await call('POST', `${base}/event-rules`, RULE)).status).toBe(201);
  const status = { fieldId: 'F_s', fieldName: 'Status', fieldType: 'single_select', value: 'Done' };
  const refused = await call('POST', `${base}/event-rules`, {
    ...RULE,
    action: { ...RULE.action, values: [status] },
  });
  expect(refused.status).toBe(400);

  const ticket = createTicket(db, { projectId, title: 'Search' });
  const preview = async (): Promise<unknown> =>
    (await call('POST', `${base}/event-rules/preview`, { ...RULE, ticketId: ticket.id })).json();
  expect(await preview()).toEqual({
    ok: false,
    error: "This ticket's issue is not on the GitHub Project",
  });
  db.update(schema.tickets)
    .set({ issueNumber: 3, projectItemId: 'item_3', prNumber: 12 })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  expect(await preview()).toEqual({
    ok: true,
    kind: 'github_project_fields',
    item: 'issue',
    number: 3,
    fields: [{ name: 'Sprint', text: '12' }],
  });
});

test("the fields are read from the project's GitHub Project", async () => {
  const response = await call('GET', `/api/projects/${projectId}/github/project-fields`);
  expect(await response.json()).toEqual(FIELDS);
  expect(asked).toEqual(['P_1']);
});
