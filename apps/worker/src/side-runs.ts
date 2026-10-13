import type { ContainerRuntime, Db } from '@union/core';

import { AgentReviewRunner } from './agent-review';
import { InvestigationRunner } from './investigate';
import type { ProvisionConfig } from './provision';
import type { RunSlots } from './slots';

/** The runs outside the ticket pipeline, taking their slots from it: investigations and agent reviews. */
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
  await investigations.recover();
  await agentReviews.recover();
  return {
    investigations,
    agentReviews,
    tick: () => {
      investigations.tick();
      agentReviews.tick();
    },
    stop: () => {
      investigations.stop();
      agentReviews.stop();
    },
    idle: async () => {
      await Promise.all([investigations.idle(), agentReviews.idle()]);
    },
  };
}
