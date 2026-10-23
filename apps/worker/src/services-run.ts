// Starts the project's agent services for a run in the ticket's container (provisioned first:
// compose reads the file from its workspace), forwards their ports to its `localhost`, and gives
// its commands the variables the setting allows.
import {
  emitEvent,
  type AgentSetup,
  getTicket,
  schema,
  type ContainerRuntime,
  type Db,
  type PortForward,
} from '@union/core';
import { eq } from 'drizzle-orm';

import {
  agentServices,
  pauseAgentServices,
  startAgentServices,
  withEnvironment,
} from './preview/background';
import { previewSettings } from './preview/compose';
import { ensureForwarder } from './preview/forwarder';
import { containerNames, ensureTicketContainer, type ProvisionConfig } from './provision';

type SetupDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

/** A run with the services: its runtime gives their variables to the ticket's container. */
export type ServicesRun = {
  runtime: ContainerRuntime;
  setup: AgentSetup | null;
  /** After the run: stops the services, unless `inUse` (another run of the ticket uses them). */
  release: (inUse: boolean) => Promise<void>;
};

function servicesOf(db: Db, projectId: number): string[] {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  return agentServices(project?.config.preview);
}

/** Starts the forwarder; never throws: what failed is logged and told to the agent. */
async function forward(
  deps: SetupDeps,
  ticketId: number,
  forwards: PortForward[],
): Promise<string[]> {
  try {
    return await ensureForwarder(deps.runtime, containerNames(ticketId).name, forwards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(deps.db, { type: 'agent_ports_failed', ticketId, payload: { error: message } });
    return [message];
  }
}

/**
 * Starts the project's agent services for a run in the ticket's container (provisioned first:
 * compose reads the file from its workspace), forwards their ports to its `localhost`, and gives
 * its commands the variables the setting allows.
 */
export async function startServicesRun(deps: SetupDeps, ticketId: number): Promise<ServicesRun> {
  const ticket = getTicket(deps.db, ticketId);
  const services = servicesOf(deps.db, ticket.projectId);
  if (services.length === 0) {
    return { runtime: deps.runtime, setup: null, release: () => Promise.resolve() };
  }
  await ensureTicketContainer(deps.db, deps.runtime, deps.config, ticket);
  const previewDeps = { ...deps, settings: previewSettings() };
  const started = await startAgentServices(previewDeps, ticketId);
  const skipped = [...started.problems, ...(await forward(deps, ticketId, started.forwards))];
  if (started.forwards.length > 0) {
    const payload = { forwards: started.forwards, skipped };
    emitEvent(deps.db, { type: 'agent_ports_forwarded', ticketId, payload });
  }
  const container = containerNames(ticketId).name;
  return {
    runtime: withEnvironment(deps.runtime, container, started.env),
    setup: {
      services,
      forwards: started.forwards,
      skipped,
      variables: Object.keys(started.env),
      ensure: async () => {
        await forward(deps, ticketId, started.forwards);
      },
    },
    release: (inUse) => pauseAgentServices(previewDeps, ticketId, inUse),
  };
}
