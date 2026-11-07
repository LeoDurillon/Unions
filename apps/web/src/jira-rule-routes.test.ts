// Tests Jira rules over the API: saved against the stored Jira project, listed with it, and previewed for one ticket.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  saveIntegration,
  schema,
  storeFields,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { EventRulesResponse } from './event-api-types';
import type { OnboardingGitHub } from './github-onboarding';

let db: Db;
let app: Hono;
let projectId: number;
let base: string;

const STORED = {
  projectName: 'Apollo',
  issueTypes: [],
  statuses: [
    { id: '1', name: 'To Do', category: 'new' },
    { id: '3', name: 'In Review', category: 'indeterminate' },
  ],
  fields: [
    { id: 'customfield_1', name: 'PR link', type: 'text' },
    { id: 'customfield_3', name: 'Priority', type: 'option' },
    { id: 'labels', name: 'Labels', type: 'labels' },
  ],
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, {} as NotionApi);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  base = `/api/projects/${projectId}/event-rules`;
});

function connect(): void {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  const saved = saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  storeFields(db, saved.id, { title: 'Apollo', fields: STORED });
}

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  const init = { method, headers: { 'content-type': 'application/json' } };
  return app.request(path, body === undefined ? init : { ...init, body: JSON.stringify(body) });
}

function rule(action: unknown): { name: string; trigger: unknown; action: unknown } {
  return { name: 'Jira', trigger: { kind: 'pull_request_linked' }, action };
}

/** What the rule with this action would do for the ticket. */
async function preview(action: unknown, ticketId: number): Promise<unknown> {
  const response = await send('POST', `${base}/preview`, {
    ...rule(action),
    enabled: true,
    ticketId,
  });
  return response.json();
}

const MOVE = { kind: 'jira_transition', statusId: '3', statusName: 'In Review' } as const;
const FIELDS = {
  kind: 'jira_field',
  values: [
    { fieldId: 'customfield_1', value: '{pr.url}' },
    { fieldId: 'labels', value: 'qa' },
  ],
};
const COMMENT = { kind: 'jira_comment', body: 'Ready for QA: {pr.url}' } as const;

test('Jira rules need the project connected to Jira, then save against its statuses and fields', async () => {
  const refused = await send('POST', base, rule(MOVE));
  expect(refused.status).toBe(400);
  expect(await refused.json()).toEqual({
    error: 'Connect the project to Jira first (Settings → Integrations → Jira)',
  });
  connect();
  for (const action of [MOVE, FIELDS, COMMENT]) {
    expect((await send('POST', base, rule(action))).status).toBe(201);
  }
  const listed = (await (await send('GET', base)).json()) as EventRulesResponse;
  expect(listed.jira).toMatchObject({
    title: 'Apollo',
    statuses: STORED.statuses,
    fields: STORED.fields,
  });
  expect(listed.rules.map((saved) => saved.action)).toEqual([
    MOVE,
    {
      kind: 'jira_field',
      values: [
        { fieldId: 'customfield_1', fieldName: 'PR link', fieldType: 'text', value: '{pr.url}' },
        { fieldId: 'labels', fieldName: 'Labels', fieldType: 'labels', value: 'qa' },
      ],
    },
    COMMENT,
  ]);
  const badOption = await send(
    'POST',
    base,
    rule({ kind: 'jira_field', values: [{ fieldId: 'customfield_3', value: '{board.status}' }] }),
  );
  expect(await badOption.json()).toEqual({
    error: 'Priority: An option is picked by its name, not with variables',
  });
});

test('a preview says what the action would do on the ticket’s issue, without calling Jira', async () => {
  connect();
  const imported = createTicket(db, {
    projectId,
    title: 'Dark mode',
    origin: { kind: 'jira', id: 'ABC-1', url: 'https://acme.atlassian.net/browse/ABC-1' },
  });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, imported.id)).run();
  const written = createTicket(db, { projectId, title: 'Written in Union' });

  expect(await preview(MOVE, imported.id)).toEqual({
    ok: true,
    kind: 'jira',
    key: 'ABC-1',
    title: 'Would move ABC-1 to In Review',
    lines: [],
    text: null,
    note: "The transition is found in the issue's workflow when the rule runs.",
  });
  expect(await preview(FIELDS, imported.id)).toMatchObject({
    title: 'Would set on ABC-1:',
    lines: ['PR link to https://github.com/acme/shop/pull/7', 'Labels: add qa'],
  });
  expect(await preview(COMMENT, imported.id)).toMatchObject({
    title: 'Would comment on ABC-1:',
    text: 'Ready for QA: https://github.com/acme/shop/pull/7',
  });
  expect(await preview(MOVE, written.id)).toEqual({
    ok: false,
    error: 'This ticket was not imported from Jira',
  });
});

test('a project connected without reading Jira lists it as not read, so the editor offers Refresh', async () => {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  const listed = (await (await send('GET', base)).json()) as EventRulesResponse;
  expect(listed.jira).toEqual({ title: '', readAt: null, statuses: [], fields: [] });
});
