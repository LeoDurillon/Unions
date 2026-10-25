// Replies to a pull request's comments: a ticket's (`/api/tickets/:id/pr-replies`, with its suggestions) and a current review's (`<review>/replies`).
import { schema, type Db, type PrCommentReply, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { loadTicket } from '../ci-load';
import { ACCEPTED, BAD_REQUEST, fail, NOT_FOUND, readObject, requireId } from '../http';
import { repliesOf } from '../pr-replies';
import {
  checkedBody,
  discardSuggestion,
  draftIds,
  editSuggestion,
  queueReply,
  sendSuggestions,
} from '../pr-reply-commands';
import { pickedPullRequest } from '../ticket-pull-request';
import { load } from './pr-review-load';

type Target = Extract<PrCommentReply['target'], { kind: 'thread' | 'note' }>;
type Reply = Pick<PrCommentReply, 'target' | 'body' | 'resolve'>;

function targetOf(value: unknown): Target {
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'thread' && 'threadId' in value && typeof value.threadId === 'string') {
      return { kind: 'thread', threadId: value.threadId };
    }
    if (value.kind === 'note' && 'url' in value && typeof value.url === 'string') {
      return { kind: 'note', url: value.url };
    }
  }
  throw fail(BAD_REQUEST, 'target must be a thread (threadId) or a note (url)');
}

/** The reply the user wrote: its target, its text, and whether to resolve (a thread's only). */
async function readReply(c: Context): Promise<Reply> {
  const body = await readObject(c.req.raw);
  const target = targetOf(body.target);
  return {
    target,
    body: checkedBody(body.body),
    resolve: target.kind === 'thread' && body.resolve === true,
  };
}

function projectOf(db: Db, ticket: Ticket): typeof schema.projects.$inferSelect {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  if (!project) {
    throw fail(NOT_FOUND, 'Project not found');
  }
  return project;
}

function commentIdOf(c: Context): number {
  return requireId(c.req.param('commentId'), 'comment id');
}

/** The suggestions' routes: edit, send (one, or all of the picked pull request), discard. */
function suggestionRoutes(routes: Hono, db: Db): void {
  routes.patch('/suggestions/:commentId', async (c) => {
    const body = await readObject(c.req.raw);
    editSuggestion(db, loadTicket(db, c), commentIdOf(c), body);
    return c.json({ ok: true });
  });
  routes.post('/suggestions/send', (c) => {
    const ticket = loadTicket(db, c);
    const sent = sendSuggestions(
      db,
      ticket,
      draftIds(db, ticket, pickedPullRequest(db, ticket, c)),
    );
    return c.json({ sent }, ACCEPTED);
  });
  routes.post('/suggestions/:commentId/send', (c) => {
    const sent = sendSuggestions(db, loadTicket(db, c), [commentIdOf(c)]);
    return c.json({ sent }, ACCEPTED);
  });
  routes.post('/suggestions/:commentId/discard', (c) => {
    discardSuggestion(db, loadTicket(db, c), commentIdOf(c));
    return c.json({ ok: true });
  });
}

/** `/api/tickets/:id/pr-replies`, on the ticket's pull request or a slice's (`?pr=`). */
export function ticketReplyRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => {
    const ticket = loadTicket(db, c);
    const number = pickedPullRequest(db, ticket, c);
    return c.json(repliesOf(db, projectOf(db, ticket), { number, ticket }));
  });
  routes.post('/', async (c) => {
    const ticket = loadTicket(db, c);
    const number = pickedPullRequest(db, ticket, c);
    const reply = await readReply(c);
    const command = queueReply(db, {
      ...reply,
      projectId: ticket.projectId,
      number,
      reviewId: null,
      ticketId: ticket.id,
    });
    return c.json(command, ACCEPTED);
  });
  suggestionRoutes(routes, db);
  return routes;
}

/** `<review>/replies`: a current review's pull request, which has no ticket nor suggestions. */
export function reviewReplyRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => {
    const { review, project } = load(db, c);
    return c.json(repliesOf(db, project, { number: review.prNumber, ticket: null }));
  });
  routes.post('/', async (c) => {
    const { review, project } = load(db, c);
    const reply = await readReply(c);
    const command = queueReply(db, {
      ...reply,
      projectId: project.id,
      number: review.prNumber,
      reviewId: review.id,
      ticketId: null,
    });
    return c.json(command, ACCEPTED);
  });
  return routes;
}
