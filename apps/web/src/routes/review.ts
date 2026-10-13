import { getTicket, isIgnoredPath, schema, type Db, type Ticket } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { DiffResponse } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { formatReview } from '../review-feedback';
import {
  addComment,
  deleteComment,
  draftsOf,
  editComment,
  listComments,
  markSent,
  type CommentDiff,
  type CommentOwner,
} from './review-comments';
import { getDiscussion, importPullRequestComments, importPullRequestNote } from './review-import';

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

/**
 * A review can be sent while the ticket waits on the user after code was written, and once it is done
 * (its branch is kept): the implementer then works on it and the final review runs again.
 */
export function canSendReview(ticket: Ticket): boolean {
  const { phase } = ticket;
  if (phase.kind === 'done') {
    return ticket.branch !== null;
  }
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
    pullRequest: ticket.prNumber,
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

function owner(ticket: Ticket): CommentOwner {
  return { kind: 'ticket', id: ticket.id };
}

/** The latest snapshot, as the comments see it. */
function commentDiff(db: Db, ticket: Ticket): CommentDiff | null {
  const snapshot = latestSnapshot(db, ticket.id);
  if (!snapshot) {
    return null;
  }
  const files = db
    .select()
    .from(schema.diffFiles)
    .where(eq(schema.diffFiles.snapshotId, snapshot.id))
    .all();
  return {
    headSha: snapshot.headSha,
    patchOf: (path) => files.find((file) => file.path === path)?.patch,
  };
}

/** Sends the drafts (plus an optional overall note) to the implementer as a change request. */
async function sendReview(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  const summary = typeof body.summary === 'string' ? body.summary : '';
  if (!canSendReview(ticket)) {
    throw fail(
      CONFLICT,
      'A review can be sent when the ticket waits on you at the implementation or the final review, or once it is done',
    );
  }
  const drafts = draftsOf(db, owner(ticket));
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
    markSent(tx, owner(ticket));
  });
  return c.json({ sent: drafts.length, feedback });
}

export function reviewRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:id/diff', (c) => getDiff(db, c));
  routes.get('/:id/diff/files/:fileId', (c) => getFile(db, c));
  routes.get('/:id/comments', (c) => {
    const ticket = loadTicket(db, c);
    return listComments(c, db, owner(ticket), latestSnapshot(db, ticket.id)?.headSha);
  });
  routes.post('/:id/comments', (c) => {
    const ticket = loadTicket(db, c);
    return addComment(c, db, owner(ticket), commentDiff(db, ticket));
  });
  routes.patch('/:id/comments/:commentId', (c) => editComment(c, db, owner(loadTicket(db, c))));
  routes.delete('/:id/comments/:commentId', (c) => deleteComment(c, db, owner(loadTicket(db, c))));
  routes.post('/:id/review', (c) => sendReview(db, c));
  routes.get('/:id/pull-request/discussion', (c) =>
    getDiscussion(db, github, loadTicket(db, c), c),
  );
  routes.post('/:id/comments/import', (c) =>
    importPullRequestComments(db, github, loadTicket(db, c), c),
  );
  routes.post('/:id/comments/import-note', (c) =>
    importPullRequestNote(db, github, loadTicket(db, c), c),
  );
  return routes;
}
