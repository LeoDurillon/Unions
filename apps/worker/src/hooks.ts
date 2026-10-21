import type { ContainerRuntime, Db, Project } from '@union/core';

import type { CommandHooks } from './command-hooks';
import type { GitHubApi } from './github/api';
import { rerunCiJob } from './github/ci-rerun';
import { sendPrDescription } from './github/pr-description-send';
import { postPullRequestReview } from './github/pr-review';
import { editTicket } from './github/ticket-edit';
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
  const { apiFor, containerRuns, reviewExplanations, updater } = deps;
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
    editTicket: (ticketId, edit) => {
      void editTicket(db, apiFor, ticketId, edit);
    },
    rerunCiJob: (ticketId, job) => {
      void rerunCiJob(db, apiFor, ticketId, job);
    },
    preview: (owner, action) => {
      previews.run(owner, action);
    },
    ...unionUpdateHooks(updater),
  };
}
