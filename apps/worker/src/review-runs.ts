// The runners of the review page's agents: agent reviews, groupings by spec and explanations of lines.
import { AgentReviewRunner, type AgentReviewDeps } from './agent-review';
import { ReviewExplainRunner } from './review-explain';
import { ReviewGroupingRunner } from './review-grouping';

export type ReviewRuns = {
  agentReviews: AgentReviewRunner;
  reviewGroupings: ReviewGroupingRunner;
  reviewExplanations: ReviewExplainRunner;
};

type Runner = { tick: () => void; stop: () => void; idle: () => Promise<void> };

/** Fails what a stopped worker left running, then returns the runners. */
export async function startReviewRuns(deps: AgentReviewDeps): Promise<ReviewRuns> {
  const runs: ReviewRuns = {
    agentReviews: new AgentReviewRunner(deps),
    reviewGroupings: new ReviewGroupingRunner(deps),
    reviewExplanations: new ReviewExplainRunner(deps),
  };
  await runs.agentReviews.recover();
  await runs.reviewGroupings.recover();
  await runs.reviewExplanations.recover();
  return runs;
}

/** The runners as a list, to tick, stop and wait for together. */
export function reviewRunners(runs: ReviewRuns): Runner[] {
  return [runs.agentReviews, runs.reviewGroupings, runs.reviewExplanations];
}
