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
import type { ProvisionConfig } from './provision';
import type { RunSlots } from './slots';

/**
 * The work outside the ticket pipeline: investigations, agent reviews and PR description rewrites
 * (taking their slots from it), and the event rules.
 */
export type SideRuns = {
  investigations: InvestigationRunner;
  agentReviews: AgentReviewRunner;
  prDescriptions: PrDescriptionRunner;
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
  const events = new EventDispatcher(deps.db, new FetchNotionApi());
  await investigations.recover();
  await agentReviews.recover();
  prDescriptions.recover();
  backfillNotionPages(deps.db);
  return {
    investigations,
    agentReviews,
    prDescriptions,
    tick: () => {
      investigations.tick();
      agentReviews.tick();
      prDescriptions.tick();
      events.tick();
    },
    stop: () => {
      investigations.stop();
      agentReviews.stop();
      prDescriptions.stop();
    },
    idle: async () => {
      await Promise.all([
        investigations.idle(),
        agentReviews.idle(),
        prDescriptions.idle(),
        events.idle(),
      ]);
    },
  };
}
