// Opens the change an agent review reads: one change (a ticket's or a pull request's) or a stack, with its prompt.
// What the findings become depends on it: drafts on the one change, or split per pull request.

import { agentReviewStack, type AgentReview, type AgentReviewOutcome } from '@union/core';

import type { TicketContainer } from '../provision';
import type { AgentReviewDeps } from './agent-review';
import { changeCoverage, changeReviewPrompt } from './agent-review-change';
import { toDrafts, type Findings } from './agent-review-findings';
import { openStackTarget, stackOutcome, stackReviewPrompt } from './agent-review-stack';
import { openTarget, type ReviewTarget } from './agent-review-target';

/** A change checked out for the agent: where it runs, what it is asked, what its findings become. */
export type Checkout = {
  container: string;
  prompt: string;
  /** The one change under review; null for a stack, which is reviewed in one pass. */
  change: ReviewTarget | null;
  close: () => Promise<void>;
  outcome: (findings: Findings) => AgentReviewOutcome;
};

/** One change (a ticket's or a pull request's), or the pull requests of a stack together. */
export async function openCheckout(
  deps: AgentReviewDeps,
  review: AgentReview,
  names: TicketContainer,
): Promise<Checkout> {
  const stack = agentReviewStack(deps.db, review.id);
  if (stack.length > 1) {
    const target = await openStackTarget(
      deps,
      stack.map((member) => member.reviewId),
      names,
    );
    return {
      container: target.container,
      prompt: stackReviewPrompt(deps.db, target, review.specs),
      change: null,
      close: target.close,
      outcome: (findings) => stackOutcome(findings, target.members),
    };
  }
  const target = await openTarget(deps, review, names);
  // The whole target, so the run gets the change's hunk index.
  return {
    ...target,
    prompt: changeReviewPrompt(deps.db, target, review.specs),
    change: target,
    outcome: (findings) => ({
      status: 'succeeded',
      headSha: target.headSha,
      drafts: toDrafts(findings, target.patchOf),
      coverage: changeCoverage(deps.db, target, review.id),
    }),
  };
}
