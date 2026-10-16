// Tests pull request rules over the API: saved and previewed for one ticket, and what they pick from on GitHub.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db, type NotionApi } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

let db: Db;
let app: Hono;
let projectId: number;
let asked: { token: string; repo: string }[];

const github = {
  listRuleChoices: (auth, repo) => {
    asked.push({
      token: auth.kind === 'token' ? auth.token : '',
      repo: `${repo.owner}/${repo.repo}`,
    });
    return Promise.resolve({ labels: ['bug', 'qa'], users: ['ada', 'grace'] });
  },
} as Pick<OnboardingGitHub, 'listRuleChoices'> as OnboardingGitHub;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, {} as NotionApi);
  asked = [];
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubToken: 'tok', config: { baseBranch: 'main' } })
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
  name: 'Ready for QA',
  trigger: { kind: 'pull_request_ready' },
  action: {
    kind: 'github_pull_request',
    changes: [
      { kind: 'labels', add: ['qa'], remove: ['wip'] },
      { kind: 'title', value: '[{ticket.id}] {ticket.title}' },
      { kind: 'description', value: 'QA: {pr.url}' },
    ],
  },
};

test('a pull request rule is saved, then previews each change with its templates filled in', async () => {
  const base = `/api/projects/${projectId}`;
  expect((await call('POST', `${base}/event-rules`, RULE)).status).toBe(201);
  const refused = await call('POST', `${base}/event-rules`, {
    ...RULE,
    action: { kind: 'github_pull_request', changes: [{ kind: 'reviewers', users: [] }] },
  });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: 'Pick who reviews' });

  const ticket = createTicket(db, { projectId, title: 'Search' });
  const preview = async (): Promise<unknown> =>
    (await call('POST', `${base}/event-rules/preview`, { ...RULE, ticketId: ticket.id })).json();
  expect(await preview()).toEqual({ ok: false, error: 'This ticket has no pull request yet' });
  db.update(schema.tickets).set({ prNumber: 12 }).where(eq(schema.tickets.id, ticket.id)).run();
  expect(await preview()).toEqual({
    ok: true,
    kind: 'github_pull_request',
    number: 12,
    changes: [
      'added labels qa, removed labels wip',
      `title set to "[${ticket.id}] Search"`,
      'description section: "QA: https://github.com/o/r/pull/12"',
    ],
  });
});

test("the labels and users to pick from are read with the project's credentials", async () => {
  const response = await call('GET', `/api/projects/${projectId}/github/rule-choices`);
  expect(await response.json()).toEqual({ labels: ['bug', 'qa'], users: ['ada', 'grace'] });
  expect(asked).toEqual([{ token: 'tok', repo: 'o/r' }]);
});
