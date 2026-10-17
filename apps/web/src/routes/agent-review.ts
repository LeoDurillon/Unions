import {
  agentReviewStack,
  AgentReviewBusyError,
  latestAgentReview,
  parseAgentReviewSpecs,
  queueAgentReview,
  schema,
  type AgentReviewOwner,
  type AgentReviewSpec,
  type Db,
} from '@union/core';
import type { Context } from 'hono';

import type { AgentReviewView } from '../api-types';
import { ACCEPTED, BAD_REQUEST, CONFLICT, fail } from '../http';

function view(db: Db, owner: AgentReviewOwner): AgentReviewView | null {
  const review = latestAgentReview(db, owner);
  if (!review) {
    return null;
  }
  const { id, status, error, comments, specs, createdAt, startedAt, finishedAt } = review;
  const members = agentReviewStack(db, id);
  const stack = members.length > 0 ? members.map((member) => member.prNumber) : null;
  return { id, status, error, comments, specs, stack, createdAt, startedAt, finishedAt };
}

/** The owner's latest agent review, null when none was asked. */
export function getAgentReview(c: Context, db: Db, owner: AgentReviewOwner): Response {
  return c.json(view(db, owner));
}

/** What a request to start asks for: the specs (null when it gives none), and a stack's pull requests. */
export type AgentReviewBody = { specs: AgentReviewSpec[] | null; stack: number[] | null };

function isNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => Number.isInteger(n) && Number(n) > 0);
}

/** An empty body asks for today's review: no specs, no stack. */
export async function readAgentReviewBody(request: Request): Promise<AgentReviewBody> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return { specs: null, stack: null };
  }
  let specs: AgentReviewSpec[] | null = null;
  if ('specs' in body) {
    const parsed = parseAgentReviewSpecs(body.specs);
    if ('error' in parsed) {
      throw fail(BAD_REQUEST, parsed.error);
    }
    ({ specs } = parsed);
  }
  const stack = 'stack' in body ? body.stack : null;
  if (stack !== null && stack !== undefined && !isNumbers(stack)) {
    throw fail(BAD_REQUEST, '"stack" must be pull request numbers');
  }
  return { specs, stack: stack ?? null };
}

/**
 * Queues the agent; `refusal` says why it cannot review this change now. `members`: a stack's
 * reviews, bottom first (`owner` is the bottom one).
 */
export function startAgentReview(
  c: Context,
  db: Db,
  start: {
    owner: AgentReviewOwner;
    refusal: string | null;
    specs: AgentReviewSpec[] | null;
    members?: number[];
  },
): Response {
  if (start.refusal !== null) {
    throw fail(CONFLICT, start.refusal);
  }
  try {
    queueAgentReview(db, start.owner, start.specs, start.members);
  } catch (error) {
    if (error instanceof AgentReviewBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
  return c.json(view(db, start.owner), ACCEPTED);
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
