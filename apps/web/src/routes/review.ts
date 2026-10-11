import {
  getTicket,
  isIgnoredPath,
  parsePatch,
  schema,
  type Db,
  type DiffLine,
  type Ticket,
} from '@union/core';
import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { CommentView, DiffResponse } from '../api-types';
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
import { formatReview } from '../review-feedback';

function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

function latestSnapshot(
  db: Db,
  ticketId: number,
): typeof schema.diffSnapshots.$inferSelect | undefined {
  return db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
}

/** A review can be sent while the ticket waits on the user after code was written. */
export function canSendReview(ticket: Ticket): boolean {
  const { phase } = ticket;
  return (
    phase.kind === 'awaiting_approval' &&
    (phase.step === 'implement' || phase.step === 'final_review')
  );
}

function ignoreRule(db: Db, ticket: Ticket): (path: string) => boolean {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const patterns = project?.config.reviewIgnore ?? [];
  const hideLockFiles = project?.config.hideLockFiles !== false;
  return (path) => isIgnoredPath(path, patterns, hideLockFiles);
}

function getDiff(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  const snapshot = latestSnapshot(db, ticket.id);
  const ignored = ignoreRule(db, ticket);
  const files = snapshot
    ? db
        .select()
        .from(schema.diffFiles)
        .where(eq(schema.diffFiles.snapshotId, snapshot.id))
        .orderBy(schema.diffFiles.position)
        .all()
        .map(({ patch: _patch, snapshotId: _snapshot, position: _position, ...summary }) =>
          Object.assign(summary, { ignored: ignored(summary.path) }),
        )
    : [];
  const body: DiffResponse = {
    snapshot: snapshot
      ? {
          headSha: snapshot.headSha,
          baseBranch: snapshot.baseBranch,
          createdAt: snapshot.createdAt,
        }
      : null,
    files,
    canSend: canSendReview(ticket),
  };
  return c.json(body);
}

function getFile(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  const fileId = requireId(c.req.param('fileId'), 'file id');
  const snapshot = latestSnapshot(db, ticket.id);
  const file = snapshot
    ? db
        .select()
        .from(schema.diffFiles)
        .where(and(eq(schema.diffFiles.id, fileId), eq(schema.diffFiles.snapshotId, snapshot.id)))
        .get()
    : undefined;
  if (!file) {
    throw fail(NOT_FOUND, 'File not found in the current diff');
  }
  return c.json({ id: file.id, path: file.path, patch: file.patch });
}

function lineNumber(line: DiffLine, side: 'old' | 'new'): number | null {
  if (line.kind === 'context') {
    return side === 'old' ? line.oldLine : line.newLine;
  }
  if (line.kind === 'add') {
    return side === 'new' ? line.newLine : null;
  }
  return line.kind === 'del' && side === 'old' ? line.oldLine : null;
}

/** The text of `start..end` on one side of the file's current patch; refuses lines outside the diff. */
function excerptOf(patch: string, side: 'old' | 'new', start: number, end: number): string {
  const picked = parsePatch(patch).filter((line) => {
    const number = lineNumber(line, side);
    return number !== null && number >= start && number <= end;
  });
  if (picked.length === 0) {
    throw fail(BAD_REQUEST, 'Those lines are not part of the diff');
  }
  return picked.map((line) => ('text' in line ? line.text : '')).join('\n');
}

function commentsOf(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  const head = latestSnapshot(db, ticket.id)?.headSha;
  const rows = db
    .select()
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.ticketId, ticket.id))
    .orderBy(schema.reviewComments.id)
    .all();
  const views: CommentView[] = rows.map((row) =>
    Object.assign(row, { outdated: row.headSha !== head }),
  );
  return c.json(views);
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

async function addComment(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  const path = requireText(body, 'path');
  const text = requireText(body, 'body');
  const { start, end, side } = rangeOf(body);
  const snapshot = latestSnapshot(db, ticket.id);
  const file = snapshot
    ? db
        .select()
        .from(schema.diffFiles)
        .where(eq(schema.diffFiles.snapshotId, snapshot.id))
        .all()
        .find((row) => row.path === path)
    : undefined;
  if (!snapshot || !file) {
    throw fail(BAD_REQUEST, `${path} is not in the current diff`);
  }
  const comment = db
    .insert(schema.reviewComments)
    .values({
      ticketId: ticket.id,
      path,
      side,
      startLine: start,
      endLine: end,
      excerpt: excerptOf(file.patch, side, start, end),
      body: text,
      headSha: snapshot.headSha,
    })
    .returning()
    .get();
  return c.json(comment, CREATED);
}

function draftOf(db: Db, c: Context): typeof schema.reviewComments.$inferSelect {
  const ticket = loadTicket(db, c);
  const id = requireId(c.req.param('commentId'), 'comment id');
  const comment = db
    .select()
    .from(schema.reviewComments)
    .where(and(eq(schema.reviewComments.id, id), eq(schema.reviewComments.ticketId, ticket.id)))
    .get();
  if (!comment) {
    throw fail(NOT_FOUND, 'Comment not found');
  }
  if (comment.status !== 'draft') {
    throw fail(CONFLICT, 'This comment was already sent');
  }
  return comment;
}

async function editComment(db: Db, c: Context): Promise<Response> {
  const comment = draftOf(db, c);
  const text = requireText(await readObject(c.req.raw), 'body');
  const updated = db
    .update(schema.reviewComments)
    .set({ body: text })
    .where(eq(schema.reviewComments.id, comment.id))
    .returning()
    .get();
  return c.json(updated);
}

function deleteComment(db: Db, c: Context): Response {
  const comment = draftOf(db, c);
  db.delete(schema.reviewComments).where(eq(schema.reviewComments.id, comment.id)).run();
  return c.json({ ok: true });
}

/** Sends the drafts (plus an optional overall note) to the implementer as a change request. */
async function sendReview(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  const summary = typeof body.summary === 'string' ? body.summary : '';
  if (!canSendReview(ticket)) {
    throw fail(
      CONFLICT,
      'A review can be sent when the ticket waits on you at the implementation or the final review',
    );
  }
  const drafts = db
    .select()
    .from(schema.reviewComments)
    .where(
      and(eq(schema.reviewComments.ticketId, ticket.id), eq(schema.reviewComments.status, 'draft')),
    )
    .orderBy(schema.reviewComments.id)
    .all();
  if (drafts.length === 0 && summary.trim() === '') {
    throw fail(BAD_REQUEST, 'Add at least one comment or an overall note');
  }
  const pending = db
    .select()
    .from(schema.commands)
    .where(eq(schema.commands.ticketId, ticket.id))
    .all()
    .some((command) => command.handledAt === null);
  if (pending) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
  const feedback = formatReview(drafts, summary);
  db.transaction((tx) => {
    tx.insert(schema.commands)
      .values({ type: 'revise', ticketId: ticket.id, payload: { feedback } })
      .run();
    tx.update(schema.reviewComments)
      .set({ status: 'sent', sentAt: Date.now() })
      .where(
        and(
          eq(schema.reviewComments.ticketId, ticket.id),
          eq(schema.reviewComments.status, 'draft'),
        ),
      )
      .run();
  });
  return c.json({ sent: drafts.length, feedback });
}

export function reviewRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:id/diff', (c) => getDiff(db, c));
  routes.get('/:id/diff/files/:fileId', (c) => getFile(db, c));
  routes.get('/:id/comments', (c) => commentsOf(db, c));
  routes.post('/:id/comments', (c) => addComment(db, c));
  routes.patch('/:id/comments/:commentId', (c) => editComment(db, c));
  routes.delete('/:id/comments/:commentId', (c) => deleteComment(db, c));
  routes.post('/:id/review', (c) => sendReview(db, c));
  return routes;
}
