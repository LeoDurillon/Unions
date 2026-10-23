import { getTicket, isIgnoredPath, schema, type Db, type Ticket } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { DiffResponse } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { formatTicketReview } from '../review-feedback';
import {
  cancelAgentReview,
  getAgentReview,
  readAgentReviewBody,
  startAgentReview,
} from './agent-review';
import {
  addTicketComment,
  deleteComment,
  draftsOf,
  editComment,
  keepComment,
  listTicketComments,
  markSent,
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
 * Why a review cannot be sent now, or null when it can: the ticket waits on the user after code was
 * written, or it is done with its branch kept and its pull request not merged (the implementer then
 * works on it and the final review runs again).
 */
export function sendRefusal(ticket: Ticket): string | null {
  const { phase } = ticket;
  if (phase.kind === 'done') {
    if (ticket.branch === null) {
      return 'This ticket has no branch to review.';
    }
    return ticket.prState === 'merged'
      ? 'The pull request is merged: open a new ticket for further changes.'
      : null;
  }
  const waiting =
    phase.kind === 'awaiting_approval' &&
    (phase.step === 'implement' || phase.step === 'final_review');
  return waiting
    ? null
    : 'Sending opens when the ticket waits on you at the implementation or the final review, or once it is done.';
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
    canSend: sendRefusal(ticket) === null,
    sendRefusal: sendRefusal(ticket),
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
/** Sends the drafts (plus an optional overall note) to the implementer as a change request. */
async function sendReview(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  const summary = typeof body.summary === 'string' ? body.summary : '';
  const refusal = sendRefusal(ticket);
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
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
  const feedback = formatTicketReview(db, ticket.id, { comments: drafts, summary });
  db.transaction((tx) => {
    tx.insert(schema.commands)
      .values({ type: 'revise', ticketId: ticket.id, payload: { feedback } })
      .run();
    markSent(tx, owner(ticket));
    // "Since last review" starts from the head this review was written on.
    const reviewed = latestSnapshot(tx, ticket.id)?.headSha ?? null;
    tx.update(schema.tickets)
      .set({ reviewedSha: reviewed })
      .where(eq(schema.tickets.id, ticket.id))
      .run();
  });
  return c.json({ sent: drafts.length, feedback });
}

/** Why the agent cannot review the ticket's change now, or null when it can. */
function agentRefusal(db: Db, ticket: Ticket): string | null {
  if (!ticket.branch || !latestSnapshot(db, ticket.id)) {
    return 'No diff to review yet: run the implementation first.';
  }
  return ticket.phase.kind === 'running'
    ? 'Wait for the current run to finish: the agent reviews in the same workspace.'
    : null;
}

function agentReviewRoutes(routes: Hono, db: Db): void {
  routes.get('/:id/agent-review', (c) => getAgentReview(c, db, owner(loadTicket(db, c))));
  routes.post('/:id/agent-review', async (c) => {
    const ticket = loadTicket(db, c);
    const { specs } = await readAgentReviewBody(c.req.raw);
    return startAgentReview(c, db, {
      owner: owner(ticket),
      refusal: agentRefusal(db, ticket),
      specs,
    });
  });
  routes.post('/:id/agent-review/cancel', (c) =>
    cancelAgentReview(c, db, owner(loadTicket(db, c))),
  );
  routes.post('/:id/comments/:commentId/keep', (c) => keepComment(c, db, owner(loadTicket(db, c))));
}

export function reviewRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:id/diff', (c) => getDiff(db, c));
  routes.get('/:id/diff/files/:fileId', (c) => getFile(db, c));
  routes.get('/:id/comments', (c) => {
    const ticket = loadTicket(db, c);
    return listTicketComments(c, db, ticket.id, latestSnapshot(db, ticket.id)?.headSha);
  });
  routes.post('/:id/comments', (c) => {
    const ticket = loadTicket(db, c);
    return addTicketComment(c, db, ticket.id);
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
  agentReviewRoutes(routes, db);
  return routes;
}
