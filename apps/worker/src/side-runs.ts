// Starts the work outside the ticket pipeline (investigations, review agents, PR descriptions),
// after failing what a stopped worker left running.

import { backfillNotionPages, FetchNotionApi, type Project } from '@union/core';

import { ContainerRunner } from './container-run';
import { EventDispatcher } from './event-dispatcher';
import type { GitHubApi } from './github/api';
import { InvestigationRunner, type InvestigationDeps } from './investigate';
import { PrDescriptionRunner } from './pr-description-runner';
import { startPreviewRuns, type PreviewRuns } from './preview/preview-runs';
import { reviewRunners, startReviewRuns, type ReviewRuns } from './review/review-runs';
import { ThrowawayRuns } from './throwaway-runs';
import { UnionUpdater } from './union-update';

/**
 * The work outside the ticket pipeline: investigations, the review page's agents (`ReviewRuns`), PR
 * description rewrites and the lesson writer (taking their slots from it), the event rules, the
 * previews' work (`PreviewRuns`: stopping those nobody visits, failing those whose services stopped,
 * removing finished tickets'), reading the account's claude.ai connectors, and the commands users
 * run in workspaces.
 */
export type SideRuns = ReviewRuns & {
  investigations: InvestigationRunner;
  prDescriptions: PrDescriptionRunner;
  containerRuns: ContainerRunner;
  previews: PreviewRuns['previews'];
  /** Union's own update; while it runs, the worker starts nothing new. */
  updater: UnionUpdater;
  tick: () => void;
  stop: () => void;
  idle: () => Promise<void>;
};

/** Fails what a stopped worker left running, then returns the runners. */
export async function startSideRuns(
  deps: InvestigationDeps & { apiFor: (project: Project) => GitHubApi | null },
): Promise<SideRuns> {
  const investigations = new InvestigationRunner(deps);
  const prDescriptions = new PrDescriptionRunner(deps);
  const previewRuns = startPreviewRuns(deps);
  const { previews } = previewRuns;
  const events = new EventDispatcher(deps.db, new FetchNotionApi(), deps.apiFor);
  const throwaway = new ThrowawayRuns(deps);
  const containerRuns = new ContainerRunner(deps);
  const updater = new UnionUpdater(deps.db);
  await updater.recover();
  await investigations.recover();
  const reviews = await startReviewRuns(deps);
  prDescriptions.recover();
  throwaway.recover();
  containerRuns.recover();
  backfillNotionPages(deps.db);
  return {
    ...reviews,
    investigations,
    prDescriptions,
    containerRuns,
    previews,
    updater,
    tick: () => {
      investigations.tick();
      for (const runner of reviewRunners(reviews)) {
        runner.tick();
      }
      prDescriptions.tick();
      events.tick();
      previewRuns.tick();
      throwaway.tick();
      containerRuns.tick();
    },
    stop: () => {
      investigations.stop();
      for (const runner of reviewRunners(reviews)) {
        runner.stop();
      }
      prDescriptions.stop();
      throwaway.stop();
      containerRuns.stop();
    },
    idle: async () => {
      await Promise.all([
        investigations.idle(),
        ...reviewRunners(reviews).map((runner) => runner.idle()),
        prDescriptions.idle(),
        previewRuns.idle(),
        events.idle(),
        throwaway.idle(),
        containerRuns.idle(),
        updater.idle(),
      ]);
    },
  };
}
