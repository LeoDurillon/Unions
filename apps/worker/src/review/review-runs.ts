// Runners of the review page's agents: agent reviews, spec groupings, line explanations, spec
// reports, review agents. The review agents are the user's own.
import { AgentReviewRunner, type AgentReviewDeps } from './agent-review';
import { ReviewAgentRunner } from './review-agent-run';
import { ReviewExplainRunner } from './review-explain';
import { ReviewGroupingRunner } from './review-grouping';
import { ReviewReportRunner } from './review-report';

export type ReviewRuns = {
  agentReviews: AgentReviewRunner;
  reviewGroupings: ReviewGroupingRunner;
  reviewExplanations: ReviewExplainRunner;
  reviewReports: ReviewReportRunner;
  reviewAgentRuns: ReviewAgentRunner;
};

type Runner = { tick: () => void; stop: () => void; idle: () => Promise<void> };

/** Fails what a stopped worker left running, then returns the runners. */
export async function startReviewRuns(deps: AgentReviewDeps): Promise<ReviewRuns> {
  const runs: ReviewRuns = {
    agentReviews: new AgentReviewRunner(deps),
    reviewGroupings: new ReviewGroupingRunner(deps),
    reviewExplanations: new ReviewExplainRunner(deps),
    reviewReports: new ReviewReportRunner(deps),
    reviewAgentRuns: new ReviewAgentRunner(deps),
  };
  await runs.agentReviews.recover();
  await runs.reviewGroupings.recover();
  await runs.reviewExplanations.recover();
  await runs.reviewReports.recover();
  await runs.reviewAgentRuns.recover();
  return runs;
}

/** The runners as a list, to tick, stop and wait for together. */
export function reviewRunners(runs: ReviewRuns): Runner[] {
  return [
    runs.agentReviews,
    runs.reviewGroupings,
    runs.reviewExplanations,
    runs.reviewReports,
    runs.reviewAgentRuns,
  ];
}
