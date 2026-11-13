// The `comments` cases of the adapter contract: reading threads, posting a comment, replying as the kind says. Test helper.

import { expect, test } from 'bun:test';

import { integrationKind } from './kinds';
import type { TrackerAdapter } from './tracker-adapter';
import { commentCount, type TrackerThread } from './tracker-comments';

/** What the comments cases need: an item of the fake with at least one thread. */
export type CommentsFixture = {
  adapter: TrackerAdapter;
  secret: string;
  config: unknown;
  itemId: string;
};

function comments(adapter: TrackerAdapter): NonNullable<TrackerAdapter['comments']> {
  if (!adapter.comments) {
    throw new Error('The adapter has no comments capability');
  }
  return adapter.comments;
}

function threadWith(threads: TrackerThread[], commentId: string): TrackerThread | undefined {
  return threads.find((thread) => thread.comments.some((comment) => comment.id === commentId));
}

export function commentsCases({ adapter, secret, config, itemId }: CommentsFixture): void {
  const kind = integrationKind(adapter.kind);
  const read = (): ReturnType<ReturnType<typeof comments>['read']> =>
    comments(adapter).read(secret, config, itemId);
  test('reads the threads, each with its comments and links, a quote only on text', async () => {
    const { threads, total } = await read();
    expect(threads.length).toBeGreaterThan(0);
    expect(new Set(threads.map((thread) => thread.id)).size).toBe(threads.length);
    expect(new Set(threads.map((thread) => thread.url)).size).toBe(threads.length);
    expect(total).toBeGreaterThanOrEqual(commentCount(threads));
    for (const thread of threads) {
      expect(thread.comments.length).toBeGreaterThan(0);
      expect(thread.quote !== null).toBe(thread.place === 'text');
      expect(thread.comments.every((comment) => comment.url !== '')).toBe(true);
    }
  });
  test('posts a new comment, read back as markdown', async () => {
    const text = 'Ship it **today**';
    const post = { itemId, threadId: null, mention: null, text };
    const { commentId } = await comments(adapter).post(secret, config, post);
    const after = await read();
    const thread = threadWith(after.threads, commentId);
    const posted = thread?.comments.find((comment) => comment.id === commentId);
    expect(posted?.markdown).toContain('**today**');
  });
  test(`replies ${kind.commentReplies === 'thread' ? 'in the thread' : 'with a mention'}`, async () => {
    const before = await read();
    const [first] = before.threads;
    const answered = first?.comments.find(
      (comment) => kind.commentReplies === 'thread' || comment.mention,
    );
    if (!first || !answered) {
      throw new Error('The fixture item needs a thread (with a mention, for mention replies)');
    }
    const post = { itemId, threadId: first.id, mention: answered.mention, text: 'Done' };
    const { commentId } = await comments(adapter).post(secret, config, post);
    const after = await read();
    const thread = threadWith(after.threads, commentId);
    const reply = thread?.comments.find((comment) => comment.id === commentId);
    expect(thread?.id === first.id).toBe(kind.commentReplies === 'thread');
    expect(reply?.markdown).toContain(
      kind.commentReplies === 'mention' ? `@${answered.mention?.name ?? ''}` : 'Done',
    );
  });
  test("says why the tracker refused a post, in the error's words otherwise", () => {
    expect(comments(adapter).postFailure(new Error('Socket closed'), false)).toBe('Socket closed');
  });
}
