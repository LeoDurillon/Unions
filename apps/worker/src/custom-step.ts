// A custom agent's step: refused without a prompt; after the implementation, it reads the branch against its base.
import {
  FULL_FLOW,
  ticketBase,
  type ContainerRuntime,
  type CustomStep,
  type Db,
  type Step,
  type Ticket,
} from '@union/core';

import { loadProject, reviewContext } from './review';
import { ensureBranch } from './workspace-git';

/** Whether the ticket's flow runs `step` after the implementation, when the branch has the code. */
export function runsAfterImplement(ticket: Ticket, step: CustomStep): boolean {
  const flow: readonly Step[] = ticket.flow ?? FULL_FLOW;
  const at = flow.indexOf(step);
  return at !== -1 && flow.indexOf('implement') < at;
}

/**
 * What the custom step's instructions get after its own prompt: before the implementation nothing,
 * after it the branch checked out and how to read the change (as the final review does).
 */
export async function customStepContext(
  deps: { db: Db; runtime: ContainerRuntime },
  ticket: Ticket,
  step: CustomStep,
  container: string,
): Promise<string> {
  if (!runsAfterImplement(ticket, step)) {
    return '';
  }
  if (ticket.branch === null) {
    throw new Error('No implementation branch to read: run the implementation first.');
  }
  const base = ticketBase(loadProject(deps.db, ticket.projectId), ticket);
  await ensureBranch(deps.runtime, container, ticket.branch, base);
  return reviewContext(base, ticket.branch);
}
