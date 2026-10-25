// A reply to a pull request comment, as the web queues it and the worker posts it; browser-safe.
import { isRecord } from './preview-compose-check';

/** GitHub refuses a comment body longer than this. */
export const MAX_REPLY_LENGTH = 65_536;
/** A quoted note is cut after this many lines, as the reader only needs to see what is answered. */
export const MAX_QUOTE_LINES = 12;

/**
 * What the reply answers: a line thread (GitHub's node id), a review summary or conversation
 * comment (its URL, where the pending reply shows), or an imported review comment's suggested reply.
 */
type ReplyTarget =
  | { kind: 'thread'; threadId: string }
  | { kind: 'note'; url: string }
  | { kind: 'comment'; commentId: number };

/** The payload of a `reply_pr_comment` command. `body` is the text posted as is, a quote included. */
export type PrCommentReply = {
  projectId: number;
  number: number;
  target: ReplyTarget;
  body: string;
  /** Resolve the thread once replied; only threads (and line comments) have one. */
  resolve: boolean;
  reviewId: number | null;
  ticketId: number | null;
};

function targetOf(value: unknown): ReplyTarget | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind === 'thread' && typeof value.threadId === 'string' && value.threadId !== '') {
    return { kind: 'thread', threadId: value.threadId };
  }
  if (value.kind === 'note' && typeof value.url === 'string' && value.url !== '') {
    return { kind: 'note', url: value.url };
  }
  if (value.kind === 'comment' && Number.isInteger(value.commentId)) {
    return { kind: 'comment', commentId: Number(value.commentId) };
  }
  return null;
}

function idOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}

/** The reply a `reply_pr_comment` command carries; throws when the payload is not one. */
export function replyOf(payload: unknown): PrCommentReply {
  const record = isRecord(payload) ? payload : {};
  const target = targetOf(record.target);
  const { projectId, number, body } = record;
  if (!Number.isInteger(projectId) || !Number.isInteger(number) || target === null) {
    throw new TypeError(
      'reply_pr_comment needs a "projectId", a pull request "number" and a target',
    );
  }
  if (typeof body !== 'string' || replyBodyProblem(body) !== null) {
    throw new TypeError('reply_pr_comment needs a "body" GitHub accepts');
  }
  return {
    projectId: Number(projectId),
    number: Number(number),
    target,
    body,
    resolve: record.resolve === true && target.kind !== 'note',
    reviewId: idOrNull(record.reviewId),
    ticketId: idOrNull(record.ticketId),
  };
}

/** Why GitHub would refuse the reply's text, or null when it can be sent. */
export function replyBodyProblem(body: string): string | null {
  const text = body.trim();
  if (text === '') {
    return 'Write a reply first';
  }
  return text.length > MAX_REPLY_LENGTH
    ? `A reply is at most ${MAX_REPLY_LENGTH.toLocaleString('en')} characters`
    : null;
}

/**
 * A reply to a conversation comment or review summary, which GitHub cannot thread: the author named,
 * their text quoted (cut to `MAX_QUOTE_LINES` lines), then the reply.
 */
export function quoteReply(note: { author: string; body: string }, reply: string): string {
  const lines = note.body.trim().split('\n');
  const kept = lines.length > MAX_QUOTE_LINES ? [...lines.slice(0, MAX_QUOTE_LINES), '…'] : lines;
  const quote = kept.map((line) => (line.trim() === '' ? '>' : `> ${line}`)).join('\n');
  const head = `@${note.author} wrote:\n\n${quote}`;
  return reply.trim() === '' ? `${head}\n\n` : `${head}\n\n${reply.trim()}`;
}
