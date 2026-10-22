// The API route that asks the worker to move a finished ticket's commits onto another base branch.
import {
  InvalidTransition,
  isBranchName,
  listSlices,
  schema,
  transition,
  type Db,
  type Project,
  type Ticket,
} from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject, requireText } from '../http';
import { authOf, load } from './ticket-base';

function hasPendingCommand(db: Db, ticketId: number): boolean {
  const pending = db
    .select()
    .from(schema.commands)
    .where(and(eq(schema.commands.ticketId, ticketId), isNull(schema.commands.handledAt)))
    .get();
  return pending !== undefined;
}

/** What the worker would refuse anyway, answered at once: the move, the PR, the stack, the name. */
function assertRetargetable(db: Db, ticket: Ticket, project: Project, branch: string): void {
  try {
    transition(ticket.phase, { type: 'retarget' });
  } catch (error) {
    throw error instanceof InvalidTransition
      ? fail(CONFLICT, 'The target can change at the final review, or once done')
      : error;
  }
  if (ticket.branch === null || ticket.prState !== 'open') {
    throw fail(CONFLICT, 'Only an open pull request can change its target');
  }
  if (listSlices(db, ticket.id).length > 0) {
    throw fail(CONFLICT, 'The ticket is split into a stack: split it again on the new base');
  }
  if (!isBranchName(branch) || branch === ticket.branch) {
    throw fail(CONFLICT, `"${branch}" cannot be the ticket's target`);
  }
  if (branch === (ticket.baseBranch ?? project.config.baseBranch)) {
    throw fail(CONFLICT, `The ticket already targets "${branch}"`);
  }
}

/**
 * `POST /api/tickets/:id/retarget` with `{ branch }`: queues the change of target; the branch must
 * exist on GitHub. The worker moves the commits, pushes and retargets the pull request.
 */
async function retarget(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { ticket, project } = load(db, c);
  const branch = requireText(await readObject(c.req.raw), 'branch');
  assertRetargetable(db, ticket, project, branch);
  const repo = { owner: project.owner, repo: project.repo };
  if (!(await github.hasBranch(authOf(db, project), repo, branch))) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no branch "${branch}"`);
  }
  if (hasPendingCommand(db, ticket.id)) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
  const command = db
    .insert(schema.commands)
    .values({ type: 'retarget', ticketId: ticket.id, payload: { branch } })
    .returning()
    .get();
  return c.json(command, ACCEPTED);
}

export function ticketRetargetRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.post('/:id/retarget', (c) => retarget(db, github, c));
  return routes;
}
