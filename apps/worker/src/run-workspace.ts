// Where a user's command runs: the ticket's container with the agent's services, or the pull request's own.
import {
  agentVariables,
  getPreview,
  getTicket,
  type ContainerRun,
  type ContainerRuntime,
} from '@union/core';

import type { TargetDeps } from './agent-review-target';
import { previewEnv } from './preview-env';
import { previewSettings } from './preview/compose';
import { loadTarget } from './preview/target';
import { ensureTicketContainer } from './provision';
import { openReviewContainer } from './review-checkout';
import { startServicesRun } from './services-run';

/** A running container to exec in, the variables its command gets, and what to do once it ends. */
export type Workspace = {
  name: string;
  runtime: ContainerRuntime;
  env: Record<string, string>;
  release: () => Promise<void>;
};

/**
 * The ticket's container, with the same environment as the agent's (its services, on localhost,
 * with its variables); stopped after unless a step started meanwhile. Null: a step runs there.
 */
async function ticketWorkspace(deps: TargetDeps, ticketId: number): Promise<Workspace | null> {
  const { db, runtime, config } = deps;
  const ticket = getTicket(db, ticketId);
  if (ticket.phase.kind === 'running') {
    return null;
  }
  const { name } = await ensureTicketContainer(db, runtime, config, ticket);
  const services = await startServicesRun(deps, ticketId);
  return {
    name,
    runtime: services.runtime,
    env: previewEnv(db, { ticketId }),
    release: async () => {
      // A step the user started meanwhile works in the same container: it stops it itself.
      const stepRuns = getTicket(db, ticketId).phase.kind === 'running';
      await services.release(stepRuns);
      if (!stepRuns) {
        await runtime.stop(name);
      }
    },
  };
}

/** The plain variables the agent's commands would get (the setting's choice); none without settings. */
function reviewVariables(deps: TargetDeps, reviewId: number): Record<string, string> {
  try {
    const target = loadTarget({ ...deps, settings: previewSettings() }, { reviewId });
    return agentVariables(target.plain, target.config.agentVariables);
  } catch {
    return {};
  }
}

/**
 * The pull request's own container, with the plain variables and the preview's address; stopped
 * after unless its e2e tests run there meanwhile. No agent services: they come with a ticket's step.
 */
async function reviewWorkspace(deps: TargetDeps, reviewId: number): Promise<Workspace> {
  const { db, runtime } = deps;
  const owner = { reviewId };
  const name = await openReviewContainer(deps, reviewId);
  return {
    name,
    runtime,
    env: { ...reviewVariables(deps, reviewId), ...previewEnv(db, owner) },
    release: async () => {
      if (getPreview(db, owner)?.e2eStatus !== 'running') {
        await runtime.stop(name);
      }
    },
  };
}

/** The run's workspace, started; null when it cannot take a command now (a ticket's step runs). */
export function openWorkspace(deps: TargetDeps, run: ContainerRun): Promise<Workspace | null> {
  if (run.ticketId !== null) {
    return ticketWorkspace(deps, run.ticketId);
  }
  if (run.reviewId === null) {
    throw new Error(`Run ${run.id} has no ticket and no pull request`);
  }
  return reviewWorkspace(deps, run.reviewId);
}
