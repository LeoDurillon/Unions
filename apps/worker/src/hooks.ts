// What the commands hand off to the running worker: all asynchronous, so draining stays
// synchronous.
import type { ContainerRuntime, Db, Project } from '@union/core';

import type { CommandHooks } from './command-hooks';
import type { GitHubApi } from './github/api';
import { gitHubHooks } from './github/hooks';
import { removeContainers } from './janitor';
import type { SideRuns } from './side-runs';
import { unionUpdateHooks } from './union-update';

/** What the commands hand off to the running worker: all asynchronous, so draining stays synchronous. */
export function workerHooks(
  deps: Pick<
    SideRuns,
    | 'investigations'
    | 'agentReviews'
    | 'reviewGroupings'
    | 'reviewExplanations'
    | 'reviewReports'
    | 'prDescriptions'
    | 'containerRuns'
    | 'previews'
    | 'updater'
  > & {
    db: Db;
    runtime: ContainerRuntime;
    apiFor: (project: Project) => GitHubApi | null;
  },
): CommandHooks {
  const { db, runtime, investigations, agentReviews, reviewGroupings, prDescriptions, previews } =
    deps;
  const { apiFor, containerRuns, reviewExplanations, reviewReports, updater } = deps;
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
    cancelReviewExplanation: (id) => {
      reviewExplanations.cancel(id);
    },
    cancelReviewReport: (id) => {
      reviewReports.cancel(id);
    },
    cancelPrDescription: (id) => {
      prDescriptions.cancel(id);
    },
    cancelContainerRun: (id) => {
      containerRuns.cancel(id);
    },
    preview: (owner, action) => {
      previews.run(owner, action);
    },
    ...gitHubHooks(db, apiFor),
    ...unionUpdateHooks(updater),
  };
}
