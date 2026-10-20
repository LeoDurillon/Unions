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

import type { GitHubApi, GitHubStack, PullRequestStatus, RepoRef } from './api';

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

/** A pull request's state as GitHub's stack lists it: a merged one went into the stack's base. */
function fromStack(stack: GitHubStack, number: number | null): PullRequestStatus | null {
  const pull = stack.pullRequests.find((candidate) => candidate.number === number);
  if (!pull) {
    return null;
  }
  const merged = pull.mergedAt !== null;
  return {
    state: merged ? 'merged' : pull.state,
    behindBy: null,
    mergedAt: pull.mergedAt,
    closedAt: null,
    base: merged ? stack.base : undefined,
    headSha: pull.headSha,
  };
}

/**
 * The ticket's GitHub stack, when it has one; null for a stack Union keeps alone. A stack dissolved
 * on GitHub (unstacked by hand) is forgotten: Union keeps the stack from then on.
 */
async function githubStack(db: Db, api: GitHubApi, input: Poll): Promise<GitHubStack | null> {
  const { ticket, repo } = input;
  if (ticket.githubStackNumber === null || ticket.prNumber === null) {
    return null;
  }
  const stack = await api.pullRequestStack(repo, ticket.prNumber);
  if (stack === null || !stack.open) {
    db.update(schema.tickets)
      .set({ githubStackNumber: null })
      .where(eq(schema.tickets.id, ticket.id))
      .run();
    return null;
  }
  return stack;
}

type Polled = { behindBy: number | null; managed: boolean };

/**
 * Polls the slices not settled yet: with a GitHub stack, one call for all of them; the bottom open
 * one is still asked on its own, for how far it is behind and the branch it targets now.
 */
async function pollSlices(db: Db, api: GitHubApi, input: Poll): Promise<Polled> {
  const slices = listSlices(db, input.ticket.id);
  const bottom = slices.find((slice) => slice.prState !== 'merged');
  const stack = await githubStack(db, api, input);
  const polled: Polled = { behindBy: null, managed: stack !== null };
  for (const slice of slices.filter((candidate) => !settled(candidate))) {
    const isBottom = slice.id === bottom?.id;
    const listed = stack === null || isBottom ? null : fromStack(stack, slice.prNumber);
    const status =
      listed ??
      (await api.pullRequestStatus(input.repo, slice.prNumber ?? 0, isBottom && input.behind));
    if (status !== null) {
      polled.behindBy = isBottom ? status.behindBy : polled.behindBy;
      storeSlice(db, input.ticket.id, slice, status);
    }
  }
  return polled;
}

/** A slice merged into the base and the rest not moved yet: the first open slice, else none. */
function restackDue(slices: readonly TicketSlice[], base: string): TicketSlice | null {
  const firstOpen = slices.findIndex((slice) => slice.prState !== 'merged');
  const below = firstOpen > 0 ? slices[firstOpen - 1] : undefined;
  const due = below?.mergedInto === base && below.mergedTipSha !== null;
  return due ? (slices[firstOpen] ?? null) : null;
}

/**
 * On a GitHub stack, the rest is followed once GitHub retargeted the new bottom pull request onto
 * the base: it rebased the rest by then. A stack Union keeps alone is restacked right away.
 */
async function restackReady(
  api: GitHubApi,
  input: Poll & { base: string; managed: boolean },
  bottom: TicketSlice | null,
): Promise<boolean> {
  if (bottom === null || !input.managed) {
    return bottom !== null;
  }
  const status = await api.pullRequestStatus(input.repo, bottom.prNumber ?? 0, false);
  return status?.base === input.base;
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
  const polled = await pollSlices(db, api, input);
  const slices = listSlices(db, input.ticket.id);
  const status = stackStatus(slices, base);
  const top = slices.at(-1);
  const closed = !status.complete && top?.prState === 'closed';
  return {
    prState: ticketState(status.complete, closed),
    prMergedAt: status.complete ? (top?.prMergedAt ?? null) : null,
    prClosedAt: closed ? (input.ticket.prClosedAt ?? Date.now()) : null,
    behindBy: polled.behindBy,
    restack: await restackReady(
      api,
      { ...input, base, managed: polled.managed },
      restackDue(slices, base),
    ),
  };
}

/** After a slice merged: the rest of the stack follows GitHub, or moves onto the base by git alone. */
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
