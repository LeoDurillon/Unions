import { expect, test } from 'bun:test';

import {
  MAX_QUOTE_LINES,
  MAX_REPLY_LENGTH,
  quoteReply,
  replyBodyProblem,
  replyOf,
} from './pr-comment-reply';

const BASE = { projectId: 1, number: 7, body: 'Done in 3f2a1c.' };

test('a thread reply keeps its resolve; a note reply never resolves', () => {
  expect(
    replyOf({ ...BASE, target: { kind: 'thread', threadId: 'PRRT_1' }, resolve: true }),
  ).toEqual({
    ...BASE,
    target: { kind: 'thread', threadId: 'PRRT_1' },
    resolve: true,
    reviewId: null,
    ticketId: null,
  });
  const note = replyOf({ ...BASE, target: { kind: 'note', url: 'u' }, resolve: true, ticketId: 3 });
  expect(note).toMatchObject({ resolve: false, ticketId: 3 });
});

test('a suggested reply names its review comment', () => {
  expect(replyOf({ ...BASE, target: { kind: 'comment', commentId: 12 } }).target).toEqual({
    kind: 'comment',
    commentId: 12,
  });
});

test('a payload without a target, a number or a sendable body is refused', () => {
  expect(() => replyOf({ ...BASE, target: { kind: 'thread', threadId: '' } })).toThrow('target');
  expect(() => replyOf({ ...BASE, number: '7', target: { kind: 'note', url: 'u' } })).toThrow(
    'number',
  );
  expect(() => replyOf({ ...BASE, body: '  ', target: { kind: 'note', url: 'u' } })).toThrow(
    'body',
  );
  expect(() => replyOf(null)).toThrow('target');
});

test('a reply is refused empty or longer than GitHub takes', () => {
  expect(replyBodyProblem(' \n ')).toBe('Write a reply first');
  expect(replyBodyProblem('x'.repeat(MAX_REPLY_LENGTH + 1))).toContain('at most');
  expect(replyBodyProblem('x'.repeat(MAX_REPLY_LENGTH))).toBeNull();
});

test('a quote reply names the author, quotes blank lines bare, then replies', () => {
  expect(quoteReply({ author: 'alice', body: 'Why?\n\nAlso this.' }, ' Because. ')).toBe(
    '@alice wrote:\n\n> Why?\n>\n> Also this.\n\nBecause.',
  );
  expect(quoteReply({ author: 'alice', body: 'Why?' }, '')).toBe('@alice wrote:\n\n> Why?\n\n');
});

test('a long note is cut in the quote', () => {
  const body = Array.from({ length: MAX_QUOTE_LINES + 3 }, (_, index) => `line ${index}`).join(
    '\n',
  );
  const quoted = quoteReply({ author: 'bot', body }, 'Ok.').split('\n');
  expect(quoted).toContain(`> line ${MAX_QUOTE_LINES - 1}`);
  expect(quoted).not.toContain(`> line ${MAX_QUOTE_LINES}`);
  expect(quoted).toContain('> …');
});
