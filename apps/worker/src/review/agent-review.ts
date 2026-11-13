// Runs queued agent reviews of a ticket's change or a pull request, sharing the run slots with the
// pipeline.

import {
  agentReviewStack,
  appendAgentLine,
  claimAgentReview,
  effortFor,
  failInterruptedAgentReviews,
  finishAgentReview,
  modelFor,
  toolsFor,
  type AgentReview,
  type AgentReviewOutcome,
} from '@union/core';

import { agentFailure, runAgent, type AgentFn } from '../agent/agent';
import { REPO_DIR, type TicketContainer } from '../provision';
import type { RunSlots } from '../slots';
import { changeCoverage, changeReviewPrompt } from './agent-review-change';
import { parseFindings, toDrafts, type Findings } from './agent-review-findings';
import { openStackTarget, stackOutcome, stackReviewPrompt } from './agent-review-stack';
import { openTarget, type TargetDeps } from './agent-review-target';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './engine';
import { missingBlock } from './outcome-text';

export type AgentReviewDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

/** A change checked out for the agent: where it runs, what it is asked, what its findings become. */
type Checkout = {
  container: string;
  prompt: string;
  close: () => Promise<void>;
  outcome: (findings: Findings) => AgentReviewOutcome;
};

/** One change (a ticket's or a pull request's), or the pull requests of a stack together. */
async function openCheckout(
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
      close: target.close,
      outcome: (findings) => stackOutcome(findings, target.members),
    };
  }
  const target = await openTarget(deps, review, names);
  // The whole target, so the run gets the change's hunk index.
  return {
    ...target,
    prompt: changeReviewPrompt(deps.db, target, review.specs),
    outcome: (findings) => ({
      status: 'succeeded',
      headSha: target.headSha,
      drafts: toDrafts(findings, target.patchOf),
      coverage: changeCoverage(deps.db, target, review.id),
    }),
  };
}

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
  work: async (deps, { row, target: checkout, signal }) => {
    const { db, runtime } = deps;
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: checkout.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_comments'),
      effort: effortFor(db, 'review_comments'),
      prompt: checkout.prompt,
      tools: toolsFor(db, 'review_comments'),
      signal,
      // Kept by the review's id, a pull request's too; a ticket's lines are also its Log's.
      onEvent: (event) => {
        appendAgentLine(db, {
          agentReviewId: row.id,
          ticketId: row.ticketId ?? undefined,
          payload: event,
        });
      },
    });
    if (outcome.kind !== 'ok') {
      return { status: 'failed', error: agentFailure(outcome) };
    }
    const findings = parseFindings(outcome.text);
    return findings
      ? checkout.outcome(findings)
      : { status: 'failed', error: missingBlock('comments', outcome.text) };
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
