import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type Db,
  type PrCommentReply,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { NO_HOOKS } from '../command-hooks';
import { drainCommands } from '../commands';
import { FakeGitHubApi } from './fake-api';
import { replyToPrComment } from './pr-comment-reply';

const THREAD_URL = 'https://github.com/acme/shop/pull/42#discussion_r1';
const NOTE_URL = 'https://github.com/acme/shop/pull/42#issuecomment-5';

let db: Db;
let api: FakeGitHubApi;
let projectId: number;
let ticketId: number;

function reply(input: Partial<PrCommentReply> & Pick<PrCommentReply, 'target'>): PrCommentReply {
  return {
    projectId,
    number: 42,
    body: 'Done.',
    resolve: false,
    reviewId: null,
    ticketId,
    ...input,
  };
}

function comment(kind: 'line' | 'general', githubUrl: string | null): number {
  return db
    .insert(schema.reviewComments)
    .values({
      ticketId,
      kind,
      path: kind === 'line' ? 'src/a.ts' : '',
      side: 'new',
      startLine: kind === 'line' ? 3 : 0,
      endLine: kind === 'line' ? 3 : 0,
      excerpt: '',
      body: 'Rename this.',
      headSha: 'h1',
      status: 'sent',
      githubUrl,
      replyStatus: 'sending',
      replyBody: 'Done.',
      replyAuthor: 'agent',
    })
    .returning()
    .get().id;
}

function row(id: number): typeof schema.reviewComments.$inferSelect | undefined {
  return db.select().from(schema.reviewComments).where(eq(schema.reviewComments.id, id)).get();
}

function events(): { type: string; ticketId: number | null; payload: unknown }[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type.startsWith('pr_comment'))
    .map(({ type, ticketId: id, payload }) => ({ type, ticketId: id, payload }));
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Rename' }).id;
  api.threads.push(
    {
      id: 'T1',
      repository: 'acme/shop',
      number: 42,
      url: THREAD_URL,
      resolved: false,
      replies: [],
    },
    { id: 'T2', repository: 'acme/shop', number: 41, url: 'other', resolved: false, replies: [] },
  );
});

test('a reply in a thread is posted there and resolves it when asked', async () => {
  await replyToPrComment(
    db,
    () => api,
    7,
    reply({ target: { kind: 'thread', threadId: 'T1' }, resolve: true }),
  );
  expect(api.threads[0]).toMatchObject({ replies: ['Done.'], resolved: true });
  expect(events()).toEqual([
    {
      type: 'pr_comment_replied',
      ticketId,
      payload: {
        commandId: 7,
        number: 42,
        reviewId: null,
        commentId: null,
        url: `${THREAD_URL}-reply1`,
        resolveError: null,
      },
    },
  ]);
});

test('a thread of another pull request is refused, nothing posted', async () => {
  await replyToPrComment(db, () => api, 7, reply({ target: { kind: 'thread', threadId: 'T2' } }));
  expect(api.threads[1]?.replies).toEqual([]);
  expect(events()[0]).toMatchObject({
    type: 'pr_comment_reply_failed',
    payload: { error: 'This thread is not on pull request #42', body: 'Done.' },
  });
});

test('a deleted thread fails with its reason', async () => {
  await replyToPrComment(db, () => api, 7, reply({ target: { kind: 'thread', threadId: 'T9' } }));
  expect(events()[0]?.payload).toMatchObject({ error: 'The thread is gone on GitHub' });
});

test('a note reply is a conversation comment', async () => {
  await replyToPrComment(
    db,
    () => api,
    7,
    reply({ target: { kind: 'note', url: NOTE_URL }, body: '@bob wrote:\n\n> Why?\n\nBecause.' }),
  );
  expect(api.pullComments).toEqual([{ number: 42, body: '@bob wrote:\n\n> Why?\n\nBecause.' }]);
  expect(events()[0]?.type).toBe('pr_comment_replied');
});

test('a suggested reply on a line comment goes in the thread it started, and its row turns sent', async () => {
  const id = comment('line', THREAD_URL);
  await replyToPrComment(
    db,
    () => api,
    7,
    reply({ target: { kind: 'comment', commentId: id }, body: 'Fixed in abc123.' }),
  );
  expect(api.threads[0]?.replies).toEqual(['Fixed in abc123.']);
  expect(row(id)).toMatchObject({
    replyStatus: 'sent',
    replyBody: 'Fixed in abc123.',
    replyError: null,
  });
  expect(events()[0]?.payload).toMatchObject({ commentId: id });
});

test('a suggested reply on an imported conversation comment posts a new one', async () => {
  const id = comment('general', NOTE_URL);
  await replyToPrComment(db, () => api, 7, reply({ target: { kind: 'comment', commentId: id } }));
  expect(api.pullComments).toEqual([{ number: 42, body: 'Done.' }]);
  expect(row(id)?.replyStatus).toBe('sent');
});

test('a suggestion whose thread is gone goes back to a draft with the reason', async () => {
  const id = comment('line', 'https://github.com/acme/shop/pull/42#discussion_r99');
  await replyToPrComment(db, () => api, 7, reply({ target: { kind: 'comment', commentId: id } }));
  expect(row(id)).toMatchObject({
    replyStatus: 'draft',
    replyError: 'The thread is gone on GitHub',
  });
});

test("another project's comment, or one written in Union, is refused", async () => {
  const union = comment('line', null);
  await replyToPrComment(
    db,
    () => api,
    7,
    reply({ target: { kind: 'comment', commentId: union } }),
  );
  const other = comment('line', THREAD_URL);
  await replyToPrComment(
    db,
    () => api,
    8,
    reply({ target: { kind: 'comment', commentId: other }, projectId: projectId + 1 }),
  );
  expect(events().map((event) => event.type)).toEqual([
    'pr_comment_reply_failed',
    'pr_comment_reply_failed',
  ]);
  expect(api.threads[0]?.replies).toEqual([]);
});

test('a refused resolve still reports the reply, with the permission named', async () => {
  api.resolveError = new Error('Resource not accessible by integration');
  await replyToPrComment(
    db,
    () => api,
    7,
    reply({ target: { kind: 'thread', threadId: 'T1' }, resolve: true }),
  );
  expect(api.threads[0]).toMatchObject({ replies: ['Done.'], resolved: false });
  const [event] = events();
  expect(event?.type).toBe('pr_comment_replied');
  expect(JSON.stringify(event?.payload)).toContain('needs Pull requests read and write');
});

test('a project without credentials fails the reply', async () => {
  await replyToPrComment(db, () => null, 7, reply({ target: { kind: 'note', url: NOTE_URL } }));
  expect(events()[0]?.payload).toMatchObject({ error: 'This project has no GitHub credentials' });
});

test('the reply_pr_comment command reaches the hook with its id and reply', () => {
  const calls: unknown[] = [];
  const payload = reply({ target: { kind: 'thread', threadId: 'T1' } });
  const { id } = db
    .insert(schema.commands)
    .values({ type: 'reply_pr_comment', ticketId, payload })
    .returning()
    .get();
  drainCommands(db, {
    ...NO_HOOKS,
    replyToPrComment: (commandId, sent) => {
      calls.push({ commandId, sent });
    },
  });
  expect(calls).toEqual([{ commandId: id, sent: payload }]);
});
