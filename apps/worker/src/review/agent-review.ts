// Runs queued agent reviews of a ticket's change or a pull request, sharing the run slots with the
// pipeline.

import {
  claimAgentReview,
  failInterruptedAgentReviews,
  finishAgentReview,
  type AgentReview,
  type AgentReviewOutcome,
} from '@union/core';

import type { AgentFn } from '../agent/agent';
import type { RunSlots } from '../slots';
import { answerOf, askReviewAgent } from './agent-review-ask';
import { openCheckout, type Checkout } from './agent-review-checkout';
import { runSlicedReview } from './agent-review-sliced';
import type { TargetDeps } from './agent-review-target';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './engine';

export type AgentReviewDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

/** The agent reads the change, and its findings become drafts on the diffs the user reviews. */
const agentReview: SideReviewKind<AgentReview, AgentReviewOutcome, Checkout> = {
  kind: 'agent_review',
  letter: 'a',
  claim: ({ db }) => claimAgentReview(db),
  finish: ({ db }, row, outcome) => {
    finishAgentReview(db, row.id, outcome);
  },
  failInterrupted: ({ db }) => failInterruptedAgentReviews(db),
  open: openCheckout,
  ...STANDARD_ENDS,
  work: async (deps, { row, target: checkout, files, signal }) => {
    if (row.mode === 'sliced' && checkout.change) {
      return runSlicedReview(deps, { row, target: checkout.change, files, signal });
    }
    const where = { row, container: checkout.container, signal };
    const outcome = await askReviewAgent(deps, where, 'review_comments', checkout.prompt);
    const answer = answerOf('', outcome);
    return answer.findings
      ? checkout.outcome(answer.findings)
      : { status: 'failed', error: answer.error ?? 'No answer' };
  },
};

/**
 * Runs queued agent reviews, sharing the run slots with the ticket pipeline and the investigations:
 * a ticket's in its own container, a pull request's in a throwaway one (`union-a<id>`).
 */
export class AgentReviewRunner extends SideReviewRunner<AgentReview, AgentReviewOutcome, Checkout> {
  constructor(deps: AgentReviewDeps) {
    super(deps, agentReview);
  }
}
