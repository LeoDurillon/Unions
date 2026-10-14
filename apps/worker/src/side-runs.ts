import {
  backfillNotionPages,
  FetchNotionApi,
  type ContainerRuntime,
  type Db,
  type Project,
} from '@union/core';

import { AgentReviewRunner } from './agent-review';
import { EventDispatcher } from './event-dispatcher';
import type { GitHubApi } from './github/api';
import { InvestigationRunner } from './investigate';
import { PrDescriptionRunner } from './pr-description-run';
import { createPreviewManager, type PreviewManager } from './preview/manager';
import type { ProvisionConfig } from './provision';
import { ReviewGroupingRunner } from './review-grouping';
import type { RunSlots } from './slots';

/**
 * The work outside the ticket pipeline: investigations, agent reviews, groupings by spec and PR
 * description rewrites
 * (taking their slots from it), the event rules, and stopping previews nobody visits.
 */
export type SideRuns = {
  investigations: InvestigationRunner;
  agentReviews: AgentReviewRunner;
  reviewGroupings: ReviewGroupingRunner;
  prDescriptions: PrDescriptionRunner;
  previews: PreviewManager;
  tick: () => void;
  stop: () => void;
  idle: () => Promise<void>;
};

/** Fails what a stopped worker left running, then returns the runners. */
export async function startSideRuns(deps: {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  slots: RunSlots;
  apiFor: (project: Project) => GitHubApi | null;
}): Promise<SideRuns> {
  const investigations = new InvestigationRunner(deps);
  const agentReviews = new AgentReviewRunner(deps);
  const prDescriptions = new PrDescriptionRunner(deps);
  const previews = createPreviewManager(deps);
  const reviewGroupings = new ReviewGroupingRunner(deps);
  const events = new EventDispatcher(deps.db, new FetchNotionApi());
  const idlePreviews = previews.idleWatcher();
  await investigations.recover();
  await agentReviews.recover();
  await reviewGroupings.recover();
  prDescriptions.recover();
  previews.recover();
  backfillNotionPages(deps.db);
  return {
    investigations,
    agentReviews,
    reviewGroupings,
    prDescriptions,
    previews,
    tick: () => {
      investigations.tick();
      agentReviews.tick();
      reviewGroupings.tick();
      prDescriptions.tick();
      events.tick();
      idlePreviews.tick();
    },
    stop: () => {
      investigations.stop();
      agentReviews.stop();
      reviewGroupings.stop();
      prDescriptions.stop();
    },
    idle: async () => {
      await Promise.all([
        investigations.idle(),
        agentReviews.idle(),
        reviewGroupings.idle(),
        prDescriptions.idle(),
        previews.idle(),
        events.idle(),
      ]);
    },
  };
}
