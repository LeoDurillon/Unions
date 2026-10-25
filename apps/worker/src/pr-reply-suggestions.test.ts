import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentRun } from './agent';
import { suggestReplies, type ReplyWriter } from './pr-reply-suggestions';

const runtime = {} as unknown as ContainerRuntime;
const { signal } = new AbortController();
const fails: AgentFn = () => Promise.resolve({ kind: 'error', message: 'boom' });

let db: Db;
let ticketId: number;
let logged: unknown[];
let urls = 0;

function comment(input: {
  kind: 'line' | 'general';
  body: string;
  replyStatus?: 'requested' | 'discarded' | null;
  githubUrl?: string | null;
}): number {
  return db
    .insert(schema.reviewComments)
    .values({
      ticketId,
      kind: input.kind,
      path: input.kind === 'line' ? 'src/a.ts' : '',
      side: 'new',
      startLine: 3,
      endLine: 3,
      excerpt: '',
      body: input.body,
      headSha: 'h1',
      status: 'sent',
      githubUrl: input.githubUrl === undefined ? `u${(urls += 1)}` : input.githubUrl,
      replyStatus: input.replyStatus === undefined ? 'requested' : input.replyStatus,
    })
    .returning()
    .get().id;
}

function row(id: number): typeof schema.reviewComments.$inferSelect | undefined {
  return db.select().from(schema.reviewComments).where(eq(schema.reviewComments.id, id)).get();
}

function writer(agent: AgentFn): ReplyWriter {
  return {
    db,
    runtime,
    agent,
    container: 'union-t1',
    ticketId,
    sessionId: 'session-1',
    signal,
    log: (event) => {
      logged.push(event);
    },
  };
}

function answering(replies: unknown, runs: AgentRun[] = []): AgentFn {
  return (_runtime, run) => {
    runs.push(run);
    const text = `\`\`\`json\n${JSON.stringify({ replies })}\n\`\`\``;
    return Promise.resolve({ kind: 'ok', text, sessionId: 'session-1' });
  };
}

function suggested(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'pr_replies_suggested')
    .map((event) => event.payload);
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  logged = [];
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Rename' }).id;
  db.update(schema.tickets).set({ prNumber: 42 }).where(eq(schema.tickets.id, ticketId)).run();
});

test('replies are drafted in the implementer session, a note quoted, and the event logged', async () => {
  const line = comment({ kind: 'line', body: '**@alice** on GitHub:\n\nRename this.' });
  const note = comment({ kind: 'general', body: '**@bob** commented on GitHub:\n\nAdd a test.' });
  const runs: AgentRun[] = [];
  const count = await suggestReplies(
    writer(
      answering(
        [
          { id: line, body: 'Renamed in 3f2a1c.', resolve: true },
          { id: note, body: 'Added in 9e8d7c.' },
        ],
        runs,
      ),
    ),
  );
  expect(count).toBe(2);
  expect(runs[0]).toMatchObject({ resumeSessionId: 'session-1', container: 'union-t1' });
  expect(runs[0]?.prompt).toContain(`## Comment ${line}: src/a.ts, line 3`);
  expect(row(line)).toMatchObject({
    replyStatus: 'draft',
    replyBody: 'Renamed in 3f2a1c.',
    replyAuthor: 'agent',
    replyResolve: true,
  });
  expect(row(note)?.replyBody).toBe('@bob wrote:\n\n> Add a test.\n\nAdded in 9e8d7c.');
  expect(suggested()).toEqual([{ number: 42, count: 2 }]);
});

test('no turn runs without comments asked for: written in Union, discarded or not sent', async () => {
  comment({ kind: 'line', body: 'Mine.', githubUrl: null, replyStatus: null });
  comment({ kind: 'line', body: 'Gone.', replyStatus: 'discarded' });
  const runs: AgentRun[] = [];
  expect(await suggestReplies(writer(answering([], runs)))).toBe(0);
  expect(runs).toEqual([]);
});

test('a comment the agent left out is no longer asked for', async () => {
  const answered = comment({ kind: 'line', body: 'A.' });
  const skipped = comment({ kind: 'line', body: 'B.' });
  await suggestReplies(writer(answering([{ id: answered, body: 'Done.' }])));
  expect(row(answered)?.replyStatus).toBe('draft');
  expect(row(skipped)?.replyStatus).toBeNull();
});

test('a failed turn is logged, leaves no draft and no event, and does not throw', async () => {
  const id = comment({ kind: 'line', body: 'A.' });
  expect(await suggestReplies(writer(fails))).toBe(0);
  expect(row(id)?.replyStatus).toBeNull();
  expect(logged).toEqual([
    { type: 'union_pr_replies_failed', error: 'Error: The replies turn ended with error' },
  ]);
  expect(suggested()).toEqual([]);
});
