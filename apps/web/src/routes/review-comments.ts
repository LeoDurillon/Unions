import { diffExcerpt, schema, type AgentReviewOwner, type Db } from '@union/core';
import { and, eq, type SQL } from 'drizzle-orm';
import type { Context } from 'hono';

import type { CommentView } from '../api-types';
import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../http';
import { loadSnapshot, sliceSnapshot, sliceTips } from '../slice-snapshot';

type Comment = typeof schema.reviewComments.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Whose comments these are: a ticket's review, or a current review of a pull request. */
export type CommentOwner = AgentReviewOwner;

/**
 * The diff comments are anchored in: its head commit, and each file's patch by path; on a split
 * ticket's slice, that slice's own change.
 */
export type CommentDiff = {
  headSha: string;
  patchOf: (path: string) => string | undefined;
  slicePosition?: number | null;
};

function owns(owner: CommentOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewComments.ticketId, owner.id)
    : eq(schema.reviewComments.reviewId, owner.id);
}

function ownerColumns(owner: CommentOwner): { ticketId: number } | { reviewId: number } {
  return owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id };
}

/** The owner's drafts, oldest first. */
export function draftsOf(db: Db, owner: CommentOwner): Comment[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(and(owns(owner), eq(schema.reviewComments.status, 'draft')))
    .orderBy(schema.reviewComments.id)
    .all();
}

/** The heads comments are checked against: the whole change's, and each slice's tip by position. */
export type CommentHeads = { head: string | undefined; tips?: ReadonlyMap<number, string> };

/**
 * Every comment, each marked outdated when it was written on another head than `head` (for a
 * slice's comment, another tip than its slice's).
 */
export function listComments(
  c: Context,
  db: Db,
  owner: CommentOwner,
  { head, tips = new Map<number, string>() }: CommentHeads,
): Response {
  const rows = db
    .select()
    .from(schema.reviewComments)
    .where(owns(owner))
    .orderBy(schema.reviewComments.id)
    .all();
  const views: CommentView[] = rows.map((row) => {
    const current = row.slicePosition === null ? head : tips.get(row.slicePosition);
    // General comments are about the whole pull request: they never go out of date.
    return Object.assign(row, { outdated: row.kind === 'line' && row.headSha !== current });
  });
  return c.json(views);
}

/** A ticket's comments: on its whole change, or on its slices' own changes once split. */
export function listTicketComments(
  c: Context,
  db: Db,
  ticketId: number,
  head: string | undefined,
): Response {
  return listComments(
    c,
    db,
    { kind: 'ticket', id: ticketId },
    { head, tips: sliceTips(db, ticketId) },
  );
}

function rangeOf(body: Record<string, unknown>): {
  start: number;
  end: number;
  side: 'old' | 'new';
} {
  const start = Number(body.startLine);
  const end = Number(body.endLine ?? body.startLine);
  const side = body.side === 'old' ? 'old' : 'new';
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw fail(BAD_REQUEST, 'Give a valid startLine and endLine');
  }
  return { start, end, side };
}

/** A draft on lines of the current diff; it keeps the code it points at as the excerpt. */
export async function addComment(
  c: Context,
  db: Db,
  owner: CommentOwner,
  diff: CommentDiff | null,
): Promise<Response> {
  const body = await readObject(c.req.raw);
  const path = requireText(body, 'path');
  const text = requireText(body, 'body');
  const { start, end, side } = rangeOf(body);
  const patch = diff?.patchOf(path);
  if (!diff || patch === undefined) {
    throw fail(BAD_REQUEST, `${path} is not in the current diff`);
  }
  const excerpt = diffExcerpt(patch, side, start, end);
  if (excerpt === null) {
    throw fail(BAD_REQUEST, 'Those lines are not part of the diff');
  }
  const comment = db
    .insert(schema.reviewComments)
    .values({
      ...ownerColumns(owner),
      path,
      side,
      startLine: start,
      endLine: end,
      excerpt,
      body: text,
      headSha: diff.headSha,
      slicePosition: diff.slicePosition ?? null,
    })
    .returning()
    .get();
  return c.json(comment, CREATED);
}

/** A draft on a ticket's whole change, or with `?slice=<n>` on that slice's own change. */
export function addTicketComment(c: Context, db: Db, ticketId: number): Promise<Response> {
  const asked = c.req.query('slice');
  const slice = asked === undefined ? null : requireId(asked, 'slice');
  const snapshot = slice === null ? loadSnapshot(db, ticketId) : sliceSnapshot(db, ticketId, slice);
  if (slice !== null && snapshot === null) {
    throw fail(NOT_FOUND, `This ticket's diff has no slice ${slice}`);
  }
  const diff = snapshot && {
    headSha: snapshot.headSha,
    patchOf: (path: string) => snapshot.patches.get(path),
    slicePosition: slice,
  };
  return addComment(c, db, { kind: 'ticket', id: ticketId }, diff);
}

function draftOf(c: Context, db: Db, owner: CommentOwner): Comment {
  const id = requireId(c.req.param('commentId'), 'comment id');
  const comment = db
    .select()
    .from(schema.reviewComments)
    .where(and(eq(schema.reviewComments.id, id), owns(owner)))
    .get();
  if (!comment) {
    throw fail(NOT_FOUND, 'Comment not found');
  }
  if (comment.status !== 'draft') {
    throw fail(CONFLICT, 'This comment was already sent');
  }
  return comment;
}

export async function editComment(c: Context, db: Db, owner: CommentOwner): Promise<Response> {
  const comment = draftOf(c, db, owner);
  const text = requireText(await readObject(c.req.raw), 'body');
  const updated = db
    .update(schema.reviewComments)
    // Edited, a suggestion is the user's: a new agent run no longer replaces it.
    .set({ body: text, author: 'user' })
    .where(eq(schema.reviewComments.id, comment.id))
    .returning()
    .get();
  return c.json(updated);
}

/** Keeps the agent's suggestion as is: it becomes the user's. */
export function keepComment(c: Context, db: Db, owner: CommentOwner): Response {
  const comment = draftOf(c, db, owner);
  const kept = db
    .update(schema.reviewComments)
    .set({ author: 'user' })
    .where(eq(schema.reviewComments.id, comment.id))
    .returning()
    .get();
  return c.json(kept);
}

export function deleteComment(c: Context, db: Db, owner: CommentOwner): Response {
  const comment = draftOf(c, db, owner);
  db.delete(schema.reviewComments).where(eq(schema.reviewComments.id, comment.id)).run();
  return c.json({ ok: true });
}

/** Marks the owner's drafts sent, inside the caller's transaction. */
export function markSent(tx: Tx, owner: CommentOwner): void {
  tx.update(schema.reviewComments)
    .set({ status: 'sent', sentAt: Date.now() })
    .where(and(owns(owner), eq(schema.reviewComments.status, 'draft')))
    .run();
}
