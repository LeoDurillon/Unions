import {
  AgentReviewBusyError,
  latestAgentReview,
  queueAgentReview,
  schema,
  type AgentReviewOwner,
  type Db,
} from '@union/core';
import type { Context } from 'hono';

import type { AgentReviewView } from '../api-types';
import { ACCEPTED, CONFLICT, fail } from '../http';

function view(db: Db, owner: AgentReviewOwner): AgentReviewView | null {
  const review = latestAgentReview(db, owner);
  if (!review) {
    return null;
  }
  const { id, status, error, comments, createdAt, startedAt, finishedAt } = review;
  return { id, status, error, comments, createdAt, startedAt, finishedAt };
}

/** The owner's latest agent review, null when none was asked. */
export function getAgentReview(c: Context, db: Db, owner: AgentReviewOwner): Response {
  return c.json(view(db, owner));
}

/** Queues the agent; `refusal` says why it cannot review this change now. */
export function startAgentReview(
  c: Context,
  db: Db,
  owner: AgentReviewOwner,
  refusal: string | null,
): Response {
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
  }
  try {
    queueAgentReview(db, owner);
  } catch (error) {
    if (error instanceof AgentReviewBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
  return c.json(view(db, owner), ACCEPTED);
}

/** Asks the worker to stop the review that is queued or running. */
export function cancelAgentReview(c: Context, db: Db, owner: AgentReviewOwner): Response {
  const review = latestAgentReview(db, owner);
  if (review?.status !== 'queued' && review?.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not reviewing this change');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_agent_review', payload: { agentReviewId: review.id } })
    .run();
  return c.json(view(db, owner), ACCEPTED);
}
