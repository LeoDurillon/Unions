// A pull request under review's agent review: one pull request, or the stack it is in, checked and queued for the worker.
import { schema, type AgentReviewSpec, type Db } from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { Context, Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from '../http';
import {
  cancelAgentReview,
  getAgentReview,
  readAgentReviewBody,
  startAgentReview,
} from './agent-review';
import { guarded } from './github-errors';
import { authOf, load, readReviewFiles, type Project, type Review } from './pr-review-load';

/** The reviews of these pull requests; refused when one is not under review. */
function underReview(db: Db, project: Project, numbers: number[]): Review[] {
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
  return rows;
}

/** The stack's reviews in GitHub's order, bottom first; refused unless GitHub has them in one stack. */
async function stackReviews(
  deps: { db: Db; github: OnboardingGitHub },
  project: Project,
  numbers: number[],
): Promise<Review[]> {
  const rows = underReview(deps.db, project, numbers);
  const repo = { owner: project.owner, repo: project.repo };
  const [first] = numbers;
  const stack =
    first === undefined
      ? null
      : await guarded(() => deps.github.pullRequestStack(authOf(deps.db, project), repo, first));
  const order = stack?.open === true ? stack.pullRequests.map((pull) => pull.number) : [];
  if (!numbers.every((number) => order.includes(number))) {
    throw fail(BAD_REQUEST, 'These pull requests are not one stack on GitHub');
  }
  return rows.toSorted((a, b) => order.indexOf(a.prNumber) - order.indexOf(b.prNumber));
}

function checkSpecs(specs: AgentReviewSpec[] | null, numbers: number[]): void {
  const stray = (specs ?? []).flatMap((spec) => spec.prs).filter((n) => !numbers.includes(n));
  if (stray.length > 0) {
    throw fail(BAD_REQUEST, `A spec is linked to #${stray[0]}, which is not in the stack`);
  }
}

/**
 * Every member's files read from GitHub again: the agent's comments are placed on them, and a pull
 * request merged or closed since its files were read is refused by number.
 */
async function readStack(
  deps: { db: Db; github: OnboardingGitHub },
  project: Project,
  stack: Review[],
): Promise<void> {
  const states = await Promise.all(
    stack.map(async (review) => {
      const { state } = await readReviewFiles(deps.db, deps.github, project, review);
      return { number: review.prNumber, state };
    }),
  );
  const closed = states.filter((member) => member.state !== 'open');
  if (closed.length > 0) {
    const list = closed.map((member) => `#${member.number} is ${member.state}`).join(', ');
    throw fail(CONFLICT, `${list}: a stack run takes open pull requests only`);
  }
}

/** Queues one run on every pull request of the stack. */
async function startStack(
  c: Context,
  deps: { db: Db; github: OnboardingGitHub },
  opened: { review: Review; project: Project },
  body: { specs: AgentReviewSpec[] | null; stack: number[] },
): Promise<Response> {
  const { db } = deps;
  if (!body.stack.includes(opened.review.prNumber)) {
    throw fail(BAD_REQUEST, `The stack must include #${opened.review.prNumber}`);
  }
  checkSpecs(body.specs, body.stack);
  const stack = await stackReviews(deps, opened.project, body.stack);
  await readStack(deps, opened.project, stack);
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
