// Before a step of a ticket whose base was followed: the new base brought into the workspace, which may never have had it.
import { getTicket, schema, ticketBase } from '@union/core';
import { eq } from 'drizzle-orm';

import { remoteOf } from './branch-push';
import type { ImplementDeps } from './implement-checks';
import { ensureTicketContainer } from './provision';
import { fetchIntoContainer } from './rebase-fetch';
import type { StepContext } from './scheduler';
import { refExists } from './workspace-git';

/**
 * The steps diff against the local `<base>`. After GitHub moved the pull request onto another
 * branch, the workspace (cloned on the old base) may lack it: the host fetches it once, with the
 * pushed branch. Nothing to do for a ticket that never followed a base.
 */
export async function ensureFollowedBase(deps: ImplementDeps, context: StepContext): Promise<void> {
  const ticket = getTicket(deps.db, context.ticket.id);
  if (ticket.leftBase === null || ticket.branch === null || ticket.prNumber === null) {
    return;
  }
  const project = deps.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  if (!project) {
    return;
  }
  const base = ticketBase(project, ticket);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, ticket);
  if (await refExists(deps.runtime, name, `refs/heads/${base}`)) {
    return;
  }
  const remote = await remoteOf(deps, project);
  await fetchIntoContainer(deps.runtime, name, remote, { base, branch: ticket.branch });
}
