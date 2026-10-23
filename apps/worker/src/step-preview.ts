// Starts the ticket's preview before an implementation step when the project asks for it, and gives a step's commands its addresses.
import { getPreview, getTicket, schema, type ContainerRuntime, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { previewEnv } from './preview-env';
import { withEnvironment } from './preview/background';
import { previewSettings } from './preview/compose';
import { startPreview } from './preview/run';
import { containerNames, ensureTicketContainer, type ProvisionConfig } from './provision';

type StepDeps = { db: Db; runtime: ContainerRuntime; config: ProvisionConfig };

function startsForImplementation(db: Db, projectId: number): boolean {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  return project?.config.preview?.startForImplementation === true;
}

/**
 * Before an implementation step, the preview starts (in the ticket's container, provisioned first:
 * the preview runs from its workspace) unless it runs already. Never fails the step: a preview that
 * cannot start keeps its reason on the ticket's panel, and the agent works without.
 */
export async function startStepPreview(deps: StepDeps, ticketId: number): Promise<void> {
  const ticket = getTicket(deps.db, ticketId);
  if (
    !startsForImplementation(deps.db, ticket.projectId) ||
    getPreview(deps.db, { ticketId })?.status === 'running'
  ) {
    return;
  }
  try {
    await ensureTicketContainer(deps.db, deps.runtime, deps.config, ticket);
    await startPreview({ ...deps, settings: previewSettings() }, { ticketId });
  } catch {
    // The step provisions the container itself and reports what fails there.
  }
}

/** The runtime with the running preview's variables on every command in the ticket's container. */
export function withPreviewEnv(
  db: Db,
  runtime: ContainerRuntime,
  ticketId: number,
): ContainerRuntime {
  return withEnvironment(runtime, containerNames(ticketId).name, previewEnv(db, { ticketId }));
}
