import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  dispatch,
  migrateDb,
  saveOutput,
  schema,
  type Db,
  type Project,
} from '@union/core';
import type { Hono } from 'hono';

import type { TicketDetail, TicketSummary } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makeProject(): Promise<Project> {
  const response = await send('POST', '/api/projects', {
    owner: 'acme',
    repo: 'shop',
    projectUrl: 'https://github.com/orgs/acme/projects/4',
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Project;
}

async function makeTicket(projectId: number): Promise<TicketSummary> {
  const response = await send('POST', '/api/tickets', {
    projectId,
    title: 'Add search',
    body: 'x',
  });
  expect(response.status).toBe(201);
  return (await response.json()) as TicketSummary;
}

test('projects: created from a URL with the default branch, duplicates and bad input rejected', async () => {
  const project = await makeProject();
  expect(project).toMatchObject({
    owner: 'acme',
    repo: 'shop',
    githubProjectNodeId: '',
    config: { baseBranch: 'main' },
  });
  expect(
    (
      await send('POST', '/api/projects', {
        owner: 'acme',
        repo: 'shop',
        projectUrl: 'https://github.com/orgs/acme/projects/4',
      })
    ).status,
  ).toBe(409);
  expect((await send('POST', '/api/projects', { owner: 'a', repo: 'b' })).status).toBe(400);
  expect(
    (await send('POST', '/api/projects', { owner: 'a', repo: 'b', projectUrl: 'nope' })).status,
  ).toBe(400);
  expect(((await (await send('GET', '/api/projects')).json()) as Project[]).length).toBe(1);
});

test('tickets: create, list by project, detail, validation', async () => {
  const project = await makeProject();
  const ticket = await makeTicket(project.id);
  expect(ticket).toMatchObject({ title: 'Add search', board: 'backlog' });
  expect((await send('POST', '/api/tickets', { projectId: 999, title: 't' })).status).toBe(400);
  expect((await send('POST', '/api/tickets', { projectId: project.id, title: '  ' })).status).toBe(
    400,
  );

  const list = (await (
    await send('GET', `/api/tickets?projectId=${project.id}`)
  ).json()) as TicketSummary[];
  expect(list.map((row) => row.id)).toEqual([ticket.id]);

  const detail = (await (await send('GET', `/api/tickets/${ticket.id}`)).json()) as TicketDetail;
  expect(detail.project.id).toBe(project.id);
  expect(detail.outputs).toEqual([]);
  expect((await send('GET', '/api/tickets/999')).status).toBe(404);
  expect((await send('GET', '/api/tickets/abc')).status).toBe(400);
});

test('commands: queued when valid, rejected when the transition is illegal or one is pending', async () => {
  const project = await makeProject();
  const ticket = await makeTicket(project.id);
  expect(
    (await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'approve' })).status,
  ).toBe(409);
  expect((await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'nope' })).status).toBe(
    400,
  );

  const started = await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'start' });
  expect(started.status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'start', ticketId: ticket.id },
  ]);
  expect(
    (await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'cancel' })).status,
  ).toBe(409);
});

test('revise needs feedback and is only allowed while awaiting approval', async () => {
  const project = await makeProject();
  const ticket = await makeTicket(project.id);
  dispatch(db, ticket.id, { type: 'start' });
  saveOutput(db, ticket.id, 'intake', 'draft');
  dispatch(db, ticket.id, { type: 'run_finished' });

  expect(
    (await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'revise' })).status,
  ).toBe(400);
  const ok = await send('POST', `/api/tickets/${ticket.id}/commands`, {
    type: 'revise',
    feedback: 'shorter',
  });
  expect(ok.status).toBe(202);
  expect(db.select().from(schema.commands).all()[0]?.payload).toEqual({ feedback: 'shorter' });
});

test('editing an output creates a new version, only for the step awaiting approval', async () => {
  const project = await makeProject();
  const ticket = await makeTicket(project.id);
  const url = `/api/tickets/${ticket.id}/steps/intake/output`;
  expect((await send('PUT', url, { content: 'x' })).status).toBe(409);

  dispatch(db, ticket.id, { type: 'start' });
  saveOutput(db, ticket.id, 'intake', 'draft');
  dispatch(db, ticket.id, { type: 'run_finished' });

  expect((await send('PUT', url, { content: 'draft' })).status).toBe(409);
  expect(
    (await send('PUT', `/api/tickets/${ticket.id}/steps/summary/output`, { content: 'x' })).status,
  ).toBe(409);
  expect(
    (await send('PUT', `/api/tickets/${ticket.id}/steps/bogus/output`, { content: 'x' })).status,
  ).toBe(400);
  expect((await send('PUT', url, { content: 'answered' })).status).toBe(201);

  const detail = (await (await send('GET', `/api/tickets/${ticket.id}`)).json()) as TicketDetail;
  expect(detail.outputs.map((output) => [output.version, output.content])).toEqual([
    [1, 'draft'],
    [2, 'answered'],
  ]);
});

test('events: cursor reports the latest seq and the stream filters by ticket and resumes', async () => {
  const project = await makeProject();
  const first = await makeTicket(project.id);
  const second = await makeTicket(project.id);
  const cursor = (await (await send('GET', '/api/events/cursor')).json()) as { seq: number };
  expect(cursor.seq).toBe(2);

  const latest = await app.request('/api/events?after=latest');
  const latestReader = latest.body?.getReader();
  const early = await Promise.race([latestReader?.read(), Bun.sleep(300).then(() => 'idle')]);
  await latestReader?.cancel();
  expect(early).toBe('idle');

  const response = await app.request(`/api/events?ticket=${second.id}&after=0`);
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  await reader?.cancel();
  const text = new TextDecoder().decode(chunk?.value);
  expect(text).toContain('"type":"ticket_created"');
  expect(text).toContain(`"ticketId":${second.id}`);
  expect(text).not.toContain(`"ticketId":${first.id}`);
});

test('a log history is plain JSON for one ticket or investigation, oldest first', async () => {
  const project = db
    .insert(schema.projects)
    .values({ owner: 'h', repo: 'h', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 'logged' });
  emitEvent(db, { type: 'agent_event', ticketId: ticket.id, payload: { type: 'result' } });
  createTicket(db, { projectId: project.id, title: 'other' });

  const response = await app.request(`/api/events/history?ticket=${ticket.id}`);
  const rows = (await response.json()) as { type: string; ticketId: number; seq: number }[];
  expect(rows.map((row) => [row.type, row.ticketId])).toEqual([
    ['ticket_created', ticket.id],
    ['agent_event', ticket.id],
  ]);
  expect((rows[0]?.seq ?? 0) < (rows[1]?.seq ?? 0)).toBe(true);
  expect((await app.request('/api/events/history')).status).toBe(400);
});
