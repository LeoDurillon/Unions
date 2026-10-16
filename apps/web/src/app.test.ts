import { beforeEach, expect, test } from 'bun:test';

import {
  appendAgentLine,
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

import type { LogPage, TicketDetail, TicketSummary } from './api-types';
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

test('simplify needs an open pull request and the final review or done', async () => {
  const project = await makeProject();
  const ticket = await makeTicket(project.id);
  const simplify = async (): Promise<number> => {
    const response = await send('POST', `/api/tickets/${ticket.id}/commands`, { type: 'simplify' });
    return response.status;
  };
  db.update(schema.tickets)
    .set({ phase: { kind: 'awaiting_approval', step: 'final_review' }, branch: 'feature' })
    .run();
  expect(await simplify()).toBe(409);
  db.update(schema.tickets).set({ prState: 'merged' }).run();
  expect(await simplify()).toBe(409);
  db.update(schema.tickets)
    .set({ prState: 'open', phase: { kind: 'backlog' } })
    .run();
  expect(await simplify()).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  expect(await simplify()).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([{ type: 'simplify' }]);
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

test("a ticket's Log is its events and agent lines in order, then what is new", async () => {
  const project = db
    .insert(schema.projects)
    .values({ owner: 'h', repo: 'h', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 'logged' });
  appendAgentLine(db, { ticketId: ticket.id, payload: { type: 'result' } });
  emitEvent(db, { type: 'ticket_updated_from_github', ticketId: ticket.id, payload: {} });
  createTicket(db, { projectId: project.id, title: 'other' });

  const read = async (after = ''): Promise<LogPage> =>
    (await app.request(`/api/events/log?ticket=${ticket.id}${after}`)).json() as Promise<LogPage>;
  const page = await read();
  expect(page.entries.map((entry) => entry.source)).toEqual(['event', 'agent', 'event']);
  appendAgentLine(db, { ticketId: ticket.id, payload: { type: 'assistant' } });
  const next = await read(`&after=${page.cursor}`);
  expect(next.entries.map((entry) => entry.source)).toEqual(['agent']);
  expect((await app.request('/api/events/log')).status).toBe(400);
  expect((await app.request(`/api/events/log?ticket=1&after=7`)).status).toBe(400);
});
