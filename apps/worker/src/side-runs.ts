import { backfillNotionPages, FetchNotionApi, type ContainerRuntime, type Db } from '@union/core';

import { AgentReviewRunner } from './agent-review';
import { EventDispatcher } from './event-dispatcher';
import { InvestigationRunner } from './investigate';
import type { ProvisionConfig } from './provision';
import type { RunSlots } from './slots';

/**
 * The work outside the ticket pipeline: investigations and agent reviews (taking their slots from it),
 * and the event rules.
 */
export type SideRuns = {
  investigations: InvestigationRunner;
  agentReviews: AgentReviewRunner;
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
}): Promise<SideRuns> {
  const investigations = new InvestigationRunner(deps);
  const agentReviews = new AgentReviewRunner(deps);
  const events = new EventDispatcher(deps.db, new FetchNotionApi());
  await investigations.recover();
  await agentReviews.recover();
  backfillNotionPages(deps.db);
  return {
    investigations,
    agentReviews,
    tick: () => {
      investigations.tick();
      agentReviews.tick();
      events.tick();
    },
    stop: () => {
      investigations.stop();
      agentReviews.stop();
    },
    idle: async () => {
      await Promise.all([investigations.idle(), agentReviews.idle(), events.idle()]);
    },
  };
}
