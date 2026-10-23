// The ticket's base follows its pull request's when GitHub moved it: the base merged and deleted, or edited there.
import {
  baseToFollow,
  emitEvent,
  getTicket,
  listSlices,
  parentOf,
  schema,
  type BaseFollow,
  type Db,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

function projectBase(db: Db, projectId: number): string {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project.config.baseBranch;
}

function follow(db: Db, ticket: Ticket, base: string | undefined): BaseFollow | null {
  const split = listSlices(db, ticket.id).length > 0;
  return baseToFollow(ticket, { base, projectBase: projectBase(db, ticket.projectId), split });
}

/** The merged pull request of the branch left: the parent's when it is its branch, else GitHub's. */
function mergedPullOf(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  input: { ticket: Ticket; branch: string },
): Promise<number | null> {
  const parent = parentOf(db, input.ticket);
  if (parent?.branch === input.branch && parent.prState === 'merged') {
    return Promise.resolve(parent.prNumber);
  }
  return api.mergedPullRequest(repo, input.branch);
}

/**
 * When the open pull request targets another branch on GitHub than the ticket's base, the ticket
 * takes it (`base_branch`, `chosen_base_branch`) and keeps the base it left in `left_base`, so the
 * next rebase moves only its own commits. Only the database is written; a `left_base` already kept
 * stays (its commits are still the ones to leave behind).
 */
export async function followBase(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  input: { ticket: Ticket; base: string | undefined },
): Promise<void> {
  const found = follow(db, input.ticket, input.base);
  if (!found) {
    return;
  }
  const prNumber = await mergedPullOf(db, api, repo, { ticket: input.ticket, branch: found.from });
  db.transaction((tx) => {
    // The poll is not the scheduler: a step may have started meanwhile.
    const ticket = getTicket(tx, input.ticket.id);
    if (follow(tx, ticket, input.base) === null) {
      return;
    }
    const { from, to } = found;
    tx.update(schema.tickets)
      .set({
        baseBranch: to,
        chosenBaseBranch: to,
        leftBase: ticket.leftBase ?? { branch: from, prNumber },
      })
      .where(eq(schema.tickets.id, ticket.id))
      .run();
    const reason = prNumber === null ? 'edited' : 'merged';
    emitEvent(tx, {
      type: 'base_followed',
      ticketId: ticket.id,
      payload: { from, to, prNumber, reason },
    });
  });
}
