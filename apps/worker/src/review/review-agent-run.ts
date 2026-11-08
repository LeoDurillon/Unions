// Runs the review agents the user asked for on a review's change: each in its own throwaway checkout (`union-v<id>`), installed first.

import {
  claimReviewAgentRun,
  customStep,
  effortFor,
  failInterruptedReviewAgentRuns,
  finishReviewAgentRun,
  modelFor,
  toolsFor,
  type ReviewAgentRun,
  type ReviewAgentRunOutcome,
} from '@union/core';

import { agentFailure, runAgent } from '../agent/agent';
import { REPO_DIR } from '../provision';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './engine';
import { openReviewAgentTarget } from './review-agent-checkout';
import { reviewAgentPrompt } from './review-agent-prompt';
import { prepare, type Deps } from './review-agent-setup';

const reviewAgent: SideReviewKind<ReviewAgentRun, ReviewAgentRunOutcome> = {
  kind: 'review_agent_run',
  letter: 'v',
  claim: ({ db }) => claimReviewAgentRun(db),
  finish: ({ db }, row, outcome) => {
    finishReviewAgentRun(db, row.id, outcome);
  },
  failInterrupted: ({ db }) => failInterruptedReviewAgentRuns(db),
  ...STANDARD_ENDS,
  open: openReviewAgentTarget,
  throwaway: 'all',
  work: async (deps, { row, target, signal }) => {
    const setup = await prepare(deps, row, target, signal);
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const step = customStep(row.agentId);
    const outcome = await (deps.agent ?? runAgent)(deps.runtime, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(deps.db, step),
      effort: effortFor(deps.db, step),
      prompt: reviewAgentPrompt(deps.db, target, row, setup),
      tools: toolsFor(deps.db, step),
      signal,
      onEvent: target.log,
    });
    return outcome.kind === 'ok'
      ? { status: 'succeeded', headSha: target.headSha, output: outcome.text.trim() }
      : { status: 'failed', error: agentFailure(outcome) };
  },
};

/** Runs the review agents the user asked for, on the run slots the pipeline shares. */
export class ReviewAgentRunner extends SideReviewRunner<ReviewAgentRun, ReviewAgentRunOutcome> {
  constructor(deps: Deps) {
    super(deps, reviewAgent);
  }
}
