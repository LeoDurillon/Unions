// What the commands hand off to the running worker: all asynchronous, so draining stays
// synchronous.
import type { ContainerRuntime, Db, Project } from '@union/core';

import type { CommandHooks } from './command-hooks';
import type { GitHubApi } from './github/api';
import { gitHubHooks } from './github/hooks';
import { removeContainers } from './janitor';
import type { ProvisionConfig } from './provision';
import type { SideRuns } from './side-runs';
import { trackerHooks } from './tracker-hooks';
import { unionUpdateHooks } from './union-update';
import { workspaceHooks } from './workspace-hooks';

type HookDeps = Pick<
  SideRuns,
  | 'investigations'
  | 'agentReviews'
  | 'reviewGroupings'
  | 'reviewExplanations'
  | 'reviewReports'
  | 'reviewAgentRuns'
  | 'prDescriptions'
  | 'containerRuns'
  | 'previews'
  | 'updater'
> & {
  db: Db;
  runtime: ContainerRuntime;
  config: ProvisionConfig;
  apiFor: (project: Project) => GitHubApi | null;
  /** The projects' own agent images (`AgentImages`). */
  agentImages: { sync: (projectId: number) => void };
};

/** What the commands hand off to the running worker: all asynchronous, so draining stays synchronous. */
export function workerHooks(deps: HookDeps): CommandHooks {
  const { db, runtime, investigations, agentReviews, reviewGroupings, prDescriptions, previews } =
    deps;
  const { apiFor, containerRuns, reviewExplanations, reviewReports, reviewAgentRuns, updater } =
    deps;
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
    cancelReviewAgentRun: (id) => {
      reviewAgentRuns.cancel(id);
    },
    cancelPrDescription: (id) => {
      prDescriptions.cancel(id);
    },
    cancelContainerRun: (id) => {
      containerRuns.cancel(id);
    },
    preview: (owner, action, options) => {
      previews.run(owner, action, options);
    },
    syncAgentImage: (projectId) => {
      deps.agentImages.sync(projectId);
    },
    ...workspaceHooks({ db, runtime, config: deps.config }),
    ...trackerHooks(db),
    ...gitHubHooks(db, apiFor),
    ...unionUpdateHooks(updater),
  };
}
