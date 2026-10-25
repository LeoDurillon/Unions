import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  replyOf,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { RepliesResponse } from './reply-api-types';

const THREAD = { kind: 'thread', threadId: 'PRRT_1' } as const;

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;
let urls = 0;

function send(method: string, path: string, body?: unknown): Promise<Response> | Response {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function replies(path = `/api/tickets/${ticketId}/pr-replies`): Promise<RepliesResponse> {
  return (await (await send('GET', path)).json()) as RepliesResponse;
}

function commands(): ReturnType<typeof replyOf>[] {
  return db
    .select()
    .from(schema.commands)
    .all()
    .filter((command) => command.type === 'reply_pr_comment')
    .map((command) => replyOf(command.payload));
}

function comment(input: {
  status?: 'draft' | 'sent';
  githubUrl?: string | null;
  replyStatus?: 'draft' | 'sending' | 'sent' | null;
  kind?: 'line' | 'general';
}): number {
  return db
    .insert(schema.reviewComments)
    .values({
      ticketId,
      kind: input.kind ?? 'line',
      path: 'src/a.ts',
      side: 'new',
      startLine: 3,
      endLine: 3,
      excerpt: '',
      body: 'Rename this.',
      headSha: 'h1',
      status: input.status ?? 'sent',
      githubUrl: input.githubUrl === undefined ? `https://gh/c${(urls += 1)}` : input.githubUrl,
      replyStatus: input.replyStatus === undefined ? 'draft' : input.replyStatus,
      replyBody: input.replyStatus === null ? null : 'Renamed in 3f2a1c.',
      replyAuthor: 'agent',
      replyResolve: true,
    })
    .returning()
    .get().id;
}

function row(id: number): typeof schema.reviewComments.$inferSelect | undefined {
  return db.select().from(schema.reviewComments).where(eq(schema.reviewComments.id, id)).get();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Rename' }).id;
  db.update(schema.tickets).set({ prNumber: 42 }).where(eq(schema.tickets.id, ticketId)).run();
});

test('a reply in a thread is queued for the worker, then shows pending until its event', async () => {
  const sent = await send('POST', `/api/tickets/${ticketId}/pr-replies`, {
    target: THREAD,
    body: ' Done. ',
    resolve: true,
  });
  expect(sent.status).toBe(202);
  expect(commands()).toEqual([
    {
      projectId,
      number: 42,
      target: THREAD,
      body: 'Done.',
      resolve: true,
      reviewId: null,
      ticketId,
    },
  ]);
  const before = await replies();
  expect(before).toMatchObject({
    number: 42,
    postsAs: "Posts with the project's token",
    canPost: true,
  });
  expect(before.pending).toMatchObject([{ target: THREAD, body: 'Done.' }]);
  const [command] = db.select().from(schema.commands).all();
  emitEvent(db, {
    type: 'pr_comment_replied',
    ticketId,
    payload: {
      commandId: command?.id ?? 0,
      number: 42,
      reviewId: null,
      commentId: null,
      url: 'u',
      resolveError: null,
    },
  });
  expect((await replies()).pending).toEqual([]);
});

test('a note reply never resolves; an empty or too long body and a bad target are refused', async () => {
  const path = `/api/tickets/${ticketId}/pr-replies`;
  await send('POST', path, { target: { kind: 'note', url: 'n' }, body: 'Ok.', resolve: true });
  expect(commands()[0]?.resolve).toBe(false);
  expect((await send('POST', path, { target: THREAD, body: '  ' })).status).toBe(400);
  expect((await send('POST', path, { target: THREAD, body: 'x'.repeat(70_000) })).status).toBe(400);
  expect(
    (await send('POST', path, { target: { kind: 'comment', commentId: 1 }, body: 'x' })).status,
  ).toBe(400);
  expect(commands()).toHaveLength(1);
});

test('a ticket without a pull request cannot be replied on', async () => {
  db.update(schema.tickets).set({ prNumber: null }).where(eq(schema.tickets.id, ticketId)).run();
  const response = await send('POST', `/api/tickets/${ticketId}/pr-replies`, {
    target: THREAD,
    body: 'Done.',
  });
  expect(response.status).toBe(409);
});

test('suggestions are listed, edited (the user’s then), sent one by one or all, and discarded', async () => {
  const first = comment({});
  const second = comment({ kind: 'general' });
  const third = comment({});
  comment({ replyStatus: 'sent' });
  comment({ githubUrl: null, replyStatus: null });
  const base = `/api/tickets/${ticketId}/pr-replies/suggestions`;
  expect((await replies()).suggested.map((one) => one.commentId)).toEqual([first, second, third]);

  await send('PATCH', `${base}/${first}`, { body: 'Renamed it.', resolve: false });
  expect(row(first)).toMatchObject({
    replyBody: 'Renamed it.',
    replyAuthor: 'user',
    replyResolve: false,
  });

  expect((await send('POST', `${base}/${third}/discard`)).status).toBe(200);
  expect(row(third)?.replyStatus).toBe('discarded');

  expect((await send('POST', `${base}/${first}/send`)).status).toBe(202);
  expect(row(first)?.replyStatus).toBe('sending');
  expect((await send('POST', `${base}/${first}/send`)).status).toBe(409);

  const all = await send('POST', `${base}/send`);
  expect(await all.json()).toEqual({ sent: 1 });
  expect(commands().map((reply) => [reply.target, reply.resolve, reply.body])).toEqual([
    [{ kind: 'comment', commentId: first }, false, 'Renamed it.'],
    [{ kind: 'comment', commentId: second }, false, 'Renamed in 3f2a1c.'],
  ]);
  expect((await replies()).suggested.map((one) => [one.commentId, one.status])).toEqual([
    [first, 'sending'],
    [second, 'sending'],
  ]);
});

test('Send review asks a reply for the drafts imported from GitHub, unless the setting is off', async () => {
  const imported = comment({ status: 'draft', replyStatus: null });
  const mine = comment({ status: 'draft', githubUrl: null, replyStatus: null });
  db.update(schema.tickets)
    .set({ phase: { kind: 'awaiting_approval', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await send('POST', `/api/tickets/${ticketId}/review`, { summary: '' })).status).toBe(200);
  expect([row(imported)?.replyStatus, row(mine)?.replyStatus]).toEqual(['requested', null]);

  db.delete(schema.commands).run();
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', suggestReplies: false } })
    .where(eq(schema.projects.id, projectId))
    .run();
  const later = comment({ status: 'draft', replyStatus: null });
  await send('POST', `/api/tickets/${ticketId}/review`, { summary: '' });
  expect(row(later)?.replyStatus).toBeNull();
});

test('a current review queues its replies with its id, and has no suggestions', async () => {
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  const path = `/api/projects/${projectId}/pull-requests/reviews/7/replies`;
  expect((await send('POST', path, { target: THREAD, body: 'Thanks, fixed.' })).status).toBe(202);
  expect(commands()[0]).toMatchObject({ number: 7, reviewId, ticketId: null });
  const listed = await replies(path);
  expect(listed.pending).toHaveLength(1);
  expect(listed.suggested).toEqual([]);
});
