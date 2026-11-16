// A review's Explain conversations: listed with their turns, asked in, renamed, deleted; a turn's cancel and log.

import {
  ConversationBusyError,
  deleteConversation,
  explanationLines,
  explanationOwner,
  getExplanation,
  ownedConversation,
  queueExplanation,
  renameConversation,
  schema,
  UnknownConversationError,
  type Db,
  type ExplainConversation,
  type ReviewExplanation,
} from '@union/core';
import { Hono, type Context } from 'hono';

import {
  ACCEPTED,
  CONFLICT,
  fail,
  NO_CONTENT,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../../http';
import { explanationRequest } from './explanation-request';
import { conversationViews, explanationView } from './explanation-views';
import type { GroupingTarget } from './review-groupings';

export type ExplanationLogView = { lines: { id: number; payload: unknown }[] };

async function queue(db: Db, c: Context, target: GroupingTarget): Promise<Response> {
  if (target.refusal !== null) {
    throw fail(CONFLICT, target.refusal);
  }
  const request = explanationRequest(target, await readObject(c.req.raw));
  try {
    const explanation = queueExplanation(db, target.owner, request);
    return c.json(explanationView(db, target, explanation), ACCEPTED);
  } catch (error) {
    if (error instanceof ConversationBusyError) {
      throw fail(CONFLICT, error.message);
    }
    if (error instanceof UnknownConversationError) {
      throw fail(NOT_FOUND, error.message);
    }
    throw error;
  }
}

function owned(db: Db, c: Context, target: GroupingTarget): ReviewExplanation {
  const explanation = getExplanation(db, requireId(c.req.param('explanationId'), 'explanation id'));
  const owner = explanation ? explanationOwner(explanation) : null;
  if (!explanation || owner?.kind !== target.owner.kind || owner.id !== target.owner.id) {
    throw fail(NOT_FOUND, 'Unknown explanation');
  }
  return explanation;
}

function conversation(db: Db, c: Context, target: GroupingTarget): ExplainConversation {
  const id = requireId(c.req.param('conversationId'), 'conversation id');
  const found = ownedConversation(db, target.owner, id);
  if (!found) {
    throw fail(NOT_FOUND, 'Unknown conversation');
  }
  return found;
}

/** The worker cancels a queued one and stops a running one. */
function cancel(db: Db, c: Context, target: GroupingTarget): Response {
  const explanation = owned(db, c, target);
  if (explanation.status !== 'queued' && explanation.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not answering this question');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_review_explanation', payload: { explanationId: explanation.id } })
    .run();
  return c.json(explanationView(db, target, explanation), ACCEPTED);
}

function log(db: Db, c: Context, target: GroupingTarget): Response {
  const explanation = owned(db, c, target);
  const after = Number(c.req.query('after') ?? 0);
  const lines = explanationLines(db, explanation.id, Number.isInteger(after) ? after : 0);
  const body: ExplanationLogView = { lines: lines.map(({ id, payload }) => ({ id, payload })) };
  return c.json(body);
}

async function rename(db: Db, c: Context, target: GroupingTarget): Promise<Response> {
  const found = conversation(db, c, target);
  const title = requireText(await readObject(c.req.raw), 'title');
  const { ticketId: _ticket, reviewId: _review, ...renamed } = renameConversation(db, found, title);
  return c.json(renamed);
}

function remove(db: Db, c: Context, target: GroupingTarget): Response {
  try {
    deleteConversation(db, conversation(db, c, target));
  } catch (error) {
    if (error instanceof ConversationBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
  return c.body(null, NO_CONTENT);
}

/**
 * Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
 * `/explanations` (the conversations, with their turns), `POST /explanations` (a turn: subjects and a
 * question, in `conversationId` or a new one), `PATCH|DELETE /explanations/conversations/:conversationId`,
 * `/explanations/:explanationId/cancel` and `/explanations/:explanationId/log`.
 */
export function reviewExplanationRoutes(db: Db, targetOf: (c: Context) => GroupingTarget): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(conversationViews(db, targetOf(c))));
  routes.post('/', (c) => queue(db, c, targetOf(c)));
  routes.patch('/conversations/:conversationId', (c) => rename(db, c, targetOf(c)));
  routes.delete('/conversations/:conversationId', (c) => remove(db, c, targetOf(c)));
  routes.post('/:explanationId/cancel', (c) => cancel(db, c, targetOf(c)));
  routes.get('/:explanationId/log', (c) => log(db, c, targetOf(c)));
  return routes;
}
