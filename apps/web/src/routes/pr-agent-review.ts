// A pull request under review's agent review: one pull request, or the stack it is in, checked and queued for the worker.
import { schema, type AgentReviewSpec, type Db } from '@union/core';
import { pullRequestStacks } from '@union/core/pr-stacks';
import { and, eq, inArray } from 'drizzle-orm';
import type { Context, Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, fail, NOT_FOUND } from '../http';
import {
  cancelAgentReview,
  getAgentReview,
  readAgentReviewBody,
  startAgentReview,
} from './agent-review';
import { load, readReviewFiles, type Project, type Review } from './pr-review-load';

/** The stack's reviews, bottom first; refused unless they are all under review and one stack. */
function stackReviews(db: Db, project: Project, numbers: number[]): Review[] {
  const rows = db
    .select()
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, project.id),
        inArray(schema.currentReviews.prNumber, numbers),
      ),
    )
    .all();
  const missing = numbers.filter((number) => !rows.some((row) => row.prNumber === number));
  if (missing.length > 0) {
    throw fail(
      NOT_FOUND,
      `${missing.map((n) => `#${n}`).join(', ')} not among the current reviews`,
    );
  }
  const stacks = pullRequestStacks(
    rows.map((review) => ({
      review,
      number: review.prNumber,
      headBranch: review.headBranch,
      baseBranch: review.baseBranch,
    })),
  );
  const [stack] = stacks;
  if (!stack || stacks.length > 1) {
    throw fail(BAD_REQUEST, 'These pull requests are not one stack');
  }
  return stack.map((member) => member.review);
}

function checkSpecs(specs: AgentReviewSpec[] | null, numbers: number[]): void {
  const stray = (specs ?? []).flatMap((spec) => spec.prs).filter((n) => !numbers.includes(n));
  if (stray.length > 0) {
    throw fail(BAD_REQUEST, `A spec is linked to #${stray[0]}, which is not in the stack`);
  }
}

/**
 * Queues one run on every pull request of the stack. Those whose diff was never opened have their
 * files read from GitHub first: the agent's comments are placed on them.
 */
async function startStack(
  c: Context,
  deps: { db: Db; github: OnboardingGitHub },
  opened: { review: Review; project: Project },
  body: { specs: AgentReviewSpec[] | null; stack: number[] },
): Promise<Response> {
  const { db, github } = deps;
  if (!body.stack.includes(opened.review.prNumber)) {
    throw fail(BAD_REQUEST, `The stack must include #${opened.review.prNumber}`);
  }
  checkSpecs(body.specs, body.stack);
  const stack = stackReviews(db, opened.project, body.stack);
  for (const review of stack) {
    if (!review.files || !review.headSha) {
      await readReviewFiles(db, github, opened.project, review);
    }
  }
  const [bottom] = stack;
  const sending = stack.find((review) => review.submitStatus === 'sending');
  return startAgentReview(c, db, {
    owner: { kind: 'review', id: bottom?.id ?? opened.review.id },
    refusal: sending ? `The review of #${sending.prNumber} is being posted on GitHub.` : null,
    specs: body.specs,
    members: stack.map((review) => review.id),
  });
}

function owner(review: Review): { kind: 'review'; id: number } {
  return { kind: 'review', id: review.id };
}

/** `<review>/agent-review`: the latest run (its own, or its stack's), starting and cancelling one. */
export function prAgentReviewRoutes(routes: Hono, db: Db, github: OnboardingGitHub): void {
  routes.get('/agent-review', (c) => getAgentReview(c, db, owner(load(db, c).review)));
  routes.post('/agent-review', async (c) => {
    const opened = load(db, c);
    const { specs, stack } = await readAgentReviewBody(c.req.raw);
    if (stack && stack.length > 1) {
      return startStack(c, { db, github }, opened, { specs, stack });
    }
    const { review } = opened;
    const refusal =
      review.files && review.headSha ? null : 'Open the diff first: its files are not read yet.';
    return startAgentReview(c, db, { owner: owner(review), refusal, specs });
  });
  routes.post('/agent-review/cancel', (c) => cancelAgentReview(c, db, owner(load(db, c).review)));
}
