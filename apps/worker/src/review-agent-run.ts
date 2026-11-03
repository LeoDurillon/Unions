// Runs the review agents the user asked for on a review's change, on the run slots the pipeline shares: each in its own throwaway checkout, installed first.
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

import { runAgent } from './agent';
import { withHunkIndex } from './hunk-index-file';
import { removeRunContainers } from './janitor';
import { REPO_DIR } from './provision';
import { openReviewAgentTarget, reviewAgentContainer } from './review-agent-checkout';
import { reviewAgentPrompt } from './review-agent-prompt';
import { prepare, type Deps } from './review-agent-setup';
import { RunPool } from './run-pool';

async function review(
  deps: Deps,
  run: ReviewAgentRun,
  signal: AbortSignal,
): Promise<ReviewAgentRunOutcome> {
  const target = await openReviewAgentTarget(deps, run);
  return withHunkIndex(deps.runtime, target, async () => {
    const setup = await prepare(deps, run, target, signal);
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const step = customStep(run.agentId);
    const outcome = await (deps.agent ?? runAgent)(deps.runtime, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(deps.db, step),
      effort: effortFor(deps.db, step),
      prompt: reviewAgentPrompt(deps.db, target, run, setup),
      tools: toolsFor(deps.db, step),
      signal,
      onEvent: target.log,
    });
    if (outcome.kind === 'ok') {
      return { status: 'succeeded', headSha: target.headSha, output: outcome.text.trim() };
    }
    const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
    return { status: 'failed', error: `${prefix}${outcome.message}` };
  });
}

/**
 * Runs the review agents the user asked for on a review's change, on the run slots the pipeline
 * shares: each in its own throwaway checkout (`union-v<id>`), installed first.
 */
export class ReviewAgentRunner extends RunPool<ReviewAgentRun, ReviewAgentRunOutcome> {
  constructor(private readonly deps: Deps) {
    super({
      slots: deps.slots,
      claim: () => claimReviewAgentRun(deps.db),
      run: (row, signal) => review(deps, row, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (row, outcome) => {
        finishReviewAgentRun(deps.db, row.id, outcome);
      },
    });
  }

  /** Fails the runs a stopped worker left running and removes their containers. */
  async recover(): Promise<void> {
    const left = failInterruptedReviewAgentRuns(this.deps.db);
    const containers = left.map((run) => reviewAgentContainer(run.id));
    await removeRunContainers(this.deps.db, this.deps.runtime, containers);
  }
}
