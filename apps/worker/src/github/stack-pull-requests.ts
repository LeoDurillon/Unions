// A split ticket's pull requests polled together: each slice's state, and the ticket merged only once every slice is in the base.
import {
  dispatch,
  emitEvent,
  InvalidTransition,
  listSlices,
  schema,
  stackStatus,
  ticketBase,
  type Db,
  type Ticket,
  type TicketSlice,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, PullRequestStatus, RepoRef } from './api';

/** The ticket's own state, read from its stack; `restack` when a slice just merged into the base. */
export type StackPoll = Pick<Ticket, 'prState' | 'prMergedAt' | 'prClosedAt' | 'behindBy'> & {
  restack: boolean;
};

function sliceChange(slice: TicketSlice, status: PullRequestStatus): Partial<TicketSlice> | null {
  const merged = status.state === 'merged';
  const change = {
    prState: status.state,
    prMergedAt: merged ? status.mergedAt : null,
    mergedInto: merged ? (status.base ?? null) : null,
    mergedTipSha: merged ? (status.headSha ?? null) : null,
  };
  const same =
    slice.prState === change.prState &&
    slice.prMergedAt === change.prMergedAt &&
    slice.mergedInto === change.mergedInto &&
    slice.mergedTipSha === change.mergedTipSha;
  return same ? null : change;
}

type Poll = { repo: RepoRef; ticket: Ticket; behind: boolean };

/** Stores a slice's new state; the event says so. */
function storeSlice(db: Db, ticketId: number, slice: TicketSlice, status: PullRequestStatus): void {
  const change = sliceChange(slice, status);
  if (change === null || slice.prNumber === null) {
    return;
  }
  db.update(schema.ticketSlices).set(change).where(eq(schema.ticketSlices.id, slice.id)).run();
  emitEvent(db, {
    type: 'stack_slice_status',
    ticketId,
    payload: {
      position: slice.position,
      prNumber: slice.prNumber,
      prState: status.state,
      mergedInto: change.mergedInto ?? null,
    },
  });
}

function settled(slice: TicketSlice): boolean {
  return slice.prNumber === null || (slice.prState === 'merged' && slice.prMergedAt !== null);
}

/** Polls the slices not settled yet; the bottom open one says how far the stack is behind. */
async function pollSlices(
  db: Db,
  api: GitHubApi,
  input: Poll,
): Promise<{ behindBy: number | null; newlyMerged: string[] }> {
  const slices = listSlices(db, input.ticket.id);
  const bottom = slices.find((slice) => slice.prState !== 'merged');
  let behindBy: number | null = null;
  const newlyMerged: string[] = [];
  for (const slice of slices.filter((candidate) => !settled(candidate))) {
    const isBottom = slice.id === bottom?.id;
    const status = await api.pullRequestStatus(
      input.repo,
      slice.prNumber ?? 0,
      isBottom && input.behind,
    );
    if (status !== null) {
      behindBy = isBottom ? status.behindBy : behindBy;
      if (status.state === 'merged' && slice.prState !== 'merged') {
        newlyMerged.push(status.base ?? '');
      }
      storeSlice(db, input.ticket.id, slice, status);
    }
  }
  return { behindBy, newlyMerged };
}

function projectBase(db: Db, ticket: Ticket): string {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  if (!project) {
    throw new Error(`Project ${ticket.projectId} not found`);
  }
  return ticketBase(project, ticket);
}

function ticketState(complete: boolean, closed: boolean): Ticket['prState'] {
  if (complete) {
    return 'merged';
  }
  return closed ? 'closed' : 'open';
}

/**
 * The stack's pull requests polled; null when the ticket is not split. The ticket is merged only
 * once every slice merged into its base: a slice merged into another slice's branch leaves it open.
 */
export async function pollStack(db: Db, api: GitHubApi, input: Poll): Promise<StackPoll | null> {
  if (listSlices(db, input.ticket.id).length < 2) {
    return null;
  }
  const base = projectBase(db, input.ticket);
  const { behindBy, newlyMerged } = await pollSlices(db, api, input);
  const slices = listSlices(db, input.ticket.id);
  const status = stackStatus(slices, base);
  const top = slices.at(-1);
  const closed = !status.complete && top?.prState === 'closed';
  const open = slices.some((slice) => slice.prState !== 'merged');
  return {
    prState: ticketState(status.complete, closed),
    prMergedAt: status.complete ? (top?.prMergedAt ?? null) : null,
    prClosedAt: closed ? (input.ticket.prClosedAt ?? Date.now()) : null,
    behindBy,
    restack: open && newlyMerged.includes(base),
  };
}

/** After a slice merged: the rest of the stack moves onto the base, by git alone. */
export function startRestack(db: Db, ticketId: number): void {
  try {
    dispatch(db, ticketId, { type: 'restack', hostOnly: true });
  } catch (error) {
    // A step is running, or the ticket is not reviewed yet: the PR tab offers Restack.
    if (!(error instanceof InvalidTransition)) {
      throw error;
    }
  }
}
