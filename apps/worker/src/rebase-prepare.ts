// The ticket's container put on its branch before a rebase, a simplification or a split, with the commit to restore.
import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import type { ImplementDeps } from './implement-checks';
import { ensureTicketContainer } from './provision';
import type { Rebase } from './rebase-agent';
import { headCommit } from './rebase-git';
import type { StepContext } from './scheduler';
import { ensureBranch } from './workspace-git';

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

/** The ticket's container on its branch, and the commit to put back if the run fails. */
export async function prepareBranch(deps: ImplementDeps, context: StepContext): Promise<Rebase> {
  const project = loadProject(deps.db, context.ticket.projectId);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, context.ticket);
  const ticket = getTicket(deps.db, context.ticket.id);
  if (!ticket.branch) {
    throw new Error('The ticket has no branch yet');
  }
  const base = ticketBase(project, ticket);
  await ensureBranch(deps.runtime, name, ticket.branch, base);
  const before = await headCommit(deps.runtime, name);
  return {
    deps,
    context: { ...context, ticket },
    project,
    container: name,
    branch: ticket.branch,
    base,
    before,
  };
}
