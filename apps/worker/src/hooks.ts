import type { ContainerRuntime, Db, Project } from '@union/core';

import type { AgentReviewRunner } from './agent-review';
import type { CommandHooks } from './commands';
import type { GitHubApi } from './github/api';
import { postPullRequestReview } from './github/pr-review';
import type { InvestigationRunner } from './investigate';
import { removeContainers } from './janitor';

/** What the commands hand off to the running worker: all asynchronous, so draining stays synchronous. */
export function workerHooks(deps: {
  db: Db;
  runtime: ContainerRuntime;
  investigations: InvestigationRunner;
  agentReviews: AgentReviewRunner;
  apiFor: (project: Project) => GitHubApi | null;
}): CommandHooks {
  const { db, runtime, investigations, agentReviews, apiFor } = deps;
  return {
    removeContainers: (containers) => {
      void removeContainers(db, runtime, containers);
    },
    cancelInvestigation: (id) => {
      investigations.cancel(id);
    },
    cancelAgentReview: (id) => {
      agentReviews.cancel(id);
    },
    submitPullRequestReview: (reviewId, summary) => {
      void postPullRequestReview(db, apiFor, reviewId, summary);
    },
  };
}
