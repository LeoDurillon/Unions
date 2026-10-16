// Tests GitHub comment and notification rules over the API: saved without Notion, and previewed for one ticket.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db, type NotionApi } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PublicProject } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

let db: Db;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi);
});

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const RULE = {
  name: 'Ready',
  trigger: { kind: 'pull_request_ready' },
  action: { kind: 'github_comment', on: 'pull_request', body: 'Ready for QA: {pr.url}' },
};

test('a comment rule is saved without Notion and previews its comment on the pull request', async () => {
  const project = (await (
    await call('POST', '/api/projects', { owner: 'o', repo: 'r', githubProjectNodeId: 'P' })
  ).json()) as PublicProject;
  const base = `/api/projects/${project.id}`;
  expect((await call('POST', `${base}/event-rules`, RULE)).status).toBe(201);

  const ticket = createTicket(db, { projectId: project.id, title: 'Search' });
  const preview = async (): Promise<unknown> => {
    const response = await call('POST', `${base}/event-rules/preview`, {
      ...RULE,
      ticketId: ticket.id,
    });
    return (await response.json()) as unknown;
  };
  expect(await preview()).toEqual({ ok: false, error: 'This ticket has no pull request yet' });
  db.update(schema.tickets).set({ prNumber: 12 }).where(eq(schema.tickets.id, ticket.id)).run();
  expect(await preview()).toEqual({
    ok: true,
    kind: 'github_comment',
    on: 'pull_request',
    number: 12,
    text: 'Ready for QA: https://github.com/o/r/pull/12',
  });
});

test('a notification rule previews what the bell would show, for any ticket', async () => {
  const project = (await (
    await call('POST', '/api/projects', { owner: 'o', repo: 'r', githubProjectNodeId: 'P' })
  ).json()) as PublicProject;
  const rule = {
    name: 'Approval',
    trigger: { kind: 'pull_request_ready' },
    action: { kind: 'union_notification', message: '{ticket.title} is ready' },
  };
  const base = `/api/projects/${project.id}`;
  expect((await call('POST', `${base}/event-rules`, rule)).status).toBe(201);
  const ticket = createTicket(db, { projectId: project.id, title: 'Search' });
  const response = await call('POST', `${base}/event-rules/preview`, {
    ...rule,
    ticketId: ticket.id,
  });
  expect(await response.json()).toEqual({
    ok: true,
    kind: 'union_notification',
    title: 'Search',
    text: 'Search is ready',
  });
});
