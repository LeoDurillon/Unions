import type { ContainerRuntime, Db, Project } from '@union/core';

import type { CommandHooks } from './commands';
import type { GitHubApi } from './github/api';
import { sendPrDescription } from './github/pr-description-send';
import { postPullRequestReview } from './github/pr-review';
import { removeContainers } from './janitor';
import type { SideRuns } from './side-runs';

/** What the commands hand off to the running worker: all asynchronous, so draining stays synchronous. */
export function workerHooks(
  deps: Pick<
    SideRuns,
    | 'investigations'
    | 'agentReviews'
    | 'reviewGroupings'
    | 'prDescriptions'
    | 'containerRuns'
    | 'previews'
  > & {
    db: Db;
    runtime: ContainerRuntime;
    apiFor: (project: Project) => GitHubApi | null;
  },
): CommandHooks {
  const { db, runtime, investigations, agentReviews, reviewGroupings, prDescriptions, previews } =
    deps;
  const { apiFor, containerRuns } = deps;
  return {
    removeContainers: (containers) => {
      void removeContainers(db, runtime, containers, (name) => previews.takeDownFor(name));
    },
    cancelInvestigation: (id) => {
      investigations.cancel(id);
    },
    cancelAgentReview: (id) => {
      agentReviews.cancel(id);
    },
    cancelReviewGrouping: (id) => {
      reviewGroupings.cancel(id);
    },
    submitPullRequestReview: (reviewId, submitted) => {
      void postPullRequestReview(db, apiFor, reviewId, submitted);
    },
    cancelPrDescription: (id) => {
      prDescriptions.cancel(id);
    },
    cancelContainerRun: (id) => {
      containerRuns.cancel(id);
    },
    sendPrDescription: (id) => {
      void sendPrDescription(db, apiFor, id);
    },
    preview: (ticketId, action) => {
      previews.run(ticketId, action);
    },
  };
}
