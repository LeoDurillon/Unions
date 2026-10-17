import { backfillNotionPages, FetchNotionApi, type Project } from '@union/core';

import { AgentReviewRunner } from './agent-review';
import { ContainerRunner } from './container-run';
import { EventDispatcher } from './event-dispatcher';
import type { GitHubApi } from './github/api';
import { InvestigationRunner, type InvestigationDeps } from './investigate';
import { PrDescriptionRunner } from './pr-description-run';
import { createPreviewManager, type PreviewManager } from './preview/manager';
import { ReviewGroupingRunner } from './review-grouping';
import { ThrowawayRuns } from './throwaway-runs';

/**
 * The work outside the ticket pipeline: investigations, agent reviews, groupings by spec and PR
 * description rewrites and the lesson writer (taking their slots from it), the event rules, stopping previews nobody
 * visits, reading the account's claude.ai connectors, and the commands users run in workspaces.
 */
export type SideRuns = {
  investigations: InvestigationRunner;
  agentReviews: AgentReviewRunner;
  reviewGroupings: ReviewGroupingRunner;
  prDescriptions: PrDescriptionRunner;
  containerRuns: ContainerRunner;
  previews: PreviewManager;
  tick: () => void;
  stop: () => void;
  idle: () => Promise<void>;
};

/** Fails what a stopped worker left running, then returns the runners. */
export async function startSideRuns(
  deps: InvestigationDeps & { apiFor: (project: Project) => GitHubApi | null },
): Promise<SideRuns> {
  const investigations = new InvestigationRunner(deps);
  const agentReviews = new AgentReviewRunner(deps);
  const prDescriptions = new PrDescriptionRunner(deps);
  const previews = createPreviewManager(deps);
  const reviewGroupings = new ReviewGroupingRunner(deps);
  const events = new EventDispatcher(deps.db, new FetchNotionApi(), deps.apiFor);
  const idlePreviews = previews.idleWatcher();
  const throwaway = new ThrowawayRuns(deps);
  const containerRuns = new ContainerRunner(deps);
  await investigations.recover();
  await agentReviews.recover();
  await reviewGroupings.recover();
  prDescriptions.recover();
  previews.recover();
  throwaway.recover();
  containerRuns.recover();
  backfillNotionPages(deps.db);
  return {
    investigations,
    agentReviews,
    reviewGroupings,
    prDescriptions,
    containerRuns,
    previews,
    tick: () => {
      investigations.tick();
      agentReviews.tick();
      reviewGroupings.tick();
      prDescriptions.tick();
      events.tick();
      idlePreviews.tick();
      throwaway.tick();
      containerRuns.tick();
    },
    stop: () => {
      investigations.stop();
      agentReviews.stop();
      reviewGroupings.stop();
      prDescriptions.stop();
      throwaway.stop();
      containerRuns.stop();
    },
    idle: async () => {
      await Promise.all([
        investigations.idle(),
        agentReviews.idle(),
        reviewGroupings.idle(),
        prDescriptions.idle(),
        previews.idle(),
        events.idle(),
        throwaway.idle(),
        containerRuns.idle(),
      ]);
    },
  };
}
