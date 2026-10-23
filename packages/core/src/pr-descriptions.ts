import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

import type { Db } from './db';
import { withoutStackSection } from './stack-description';
import * as schema from './tables';
import { emitEvent, getTicket } from './tickets';

export type PrDescription = typeof schema.prDescriptions.$inferSelect;

export type PrDescriptionOutcome =
  | { status: 'ready'; original: string; text: string }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

export type PrDescriptionSent =
  | { status: 'sent' }
  | { status: 'conflict' }
  | { status: 'failed'; error: string };

/** The paragraph `pullRequestBody` adds when the branch is stacked on its parent's. */
export const BUILDS_ON_LINK = /^Builds on .+, which it targets: merge that one first\.$/u;

const UNION_LINKS = [/^Closes #\d+$/u, BUILDS_ON_LINK];

/**
 * A pull request's description without the links Union adds to it (`pullRequestBody` in the
 * worker): `Closes #n`, the PR it builds on, and a split ticket's stack.
 */
export function withoutUnionLinks(body: string): string {
  return withoutStackSection(body.replaceAll('\r\n', '\n'))
    .split(/\n{2,}/u)
    .filter((part) => !UNION_LINKS.some((link) => link.test(part.trim())))
    .join('\n\n')
    .trim();
}

/** A rewrite in progress: another one is refused until it ends. */
const ACTIVE = ['queued', 'running', 'sending'] as const;
/** Drafts a new rewrite replaces. */
const OPEN = ['ready', 'conflict'] as const;

/** Why a rewrite or a send is refused; the web answers 409 with the message. */
export class PrDescriptionError extends Error {}

type Executor = Parameters<typeof emitEvent>[0];

/** Every change is an event on the ticket: its PR tab refreshes on it. */
function changed(db: Executor, row: PrDescription): void {
  emitEvent(db, {
    type: 'pr_description_changed',
    ticketId: row.ticketId,
    payload: { prDescriptionId: row.id, status: row.status, error: row.error },
  });
}

function update(db: Executor, id: number, values: Partial<PrDescription>): PrDescription {
  const row = db
    .update(schema.prDescriptions)
    .set(values)
    .where(eq(schema.prDescriptions.id, id))
    .returning()
    .get();
  changed(db, row);
  return row;
}

export function getPrDescription(db: Db, id: number): PrDescription | null {
  return (
    db.select().from(schema.prDescriptions).where(eq(schema.prDescriptions.id, id)).get() ?? null
  );
}

/** The ticket's latest rewrite (of `prNumber`'s description, when given), whatever its status. */
export function latestPrDescription(
  db: Db,
  ticketId: number,
  prNumber?: number,
): PrDescription | null {
  const ofTicket = eq(schema.prDescriptions.ticketId, ticketId);
  return (
    db
      .select()
      .from(schema.prDescriptions)
      .where(
        prNumber === undefined
          ? ofTicket
          : and(ofTicket, eq(schema.prDescriptions.prNumber, prNumber)),
      )
      .orderBy(desc(schema.prDescriptions.id))
      .get() ?? null
  );
}

/** The pull requests a rewrite covers: each open slice's when the ticket is split, else its own. */
function describedPullRequests(db: Executor, ticketId: number, own: number): number[] {
  const slices = db
    .select({ prNumber: schema.ticketSlices.prNumber, prState: schema.ticketSlices.prState })
    .from(schema.ticketSlices)
    .where(eq(schema.ticketSlices.ticketId, ticketId))
    .orderBy(asc(schema.ticketSlices.position))
    .all();
  if (slices.length < 2) {
    return [own];
  }
  return slices.flatMap((slice) =>
    slice.prNumber !== null && slice.prState !== 'merged' ? [slice.prNumber] : [],
  );
}

/**
 * Queues a rewrite of the ticket's PR description, one per open slice of a split ticket; unsent
 * drafts are discarded. Returns the ticket's own pull request's.
 */
export function queuePrDescription(db: Db, ticketId: number): PrDescription {
  return db.transaction((tx) => {
    const ticket = getTicket(tx, ticketId);
    if (ticket.prNumber === null) {
      throw new PrDescriptionError('The ticket has no pull request');
    }
    const own = ticket.prNumber;
    const rows = tx
      .select()
      .from(schema.prDescriptions)
      .where(eq(schema.prDescriptions.ticketId, ticketId))
      .all();
    if (rows.some((row) => ACTIVE.some((status) => status === row.status))) {
      throw new PrDescriptionError('The description is already being rewritten or sent');
    }
    for (const row of rows.filter((open) => OPEN.some((status) => status === open.status))) {
      update(tx, row.id, { status: 'discarded', finishedAt: Date.now() });
    }
    const queued = describedPullRequests(tx, ticketId, own).map((prNumber) => {
      const row = tx.insert(schema.prDescriptions).values({ ticketId, prNumber }).returning().get();
      changed(tx, row);
      return row;
    });
    const row = queued.find((each) => each.prNumber === own) ?? queued[0];
    if (!row) {
      throw new PrDescriptionError('No pull request of the stack is open');
    }
    return row;
  });
}

/**
 * The oldest queued rewrite, now running; null when none waits. A ticket's rewrites run one at a
 * time: they share its container and its session.
 */
export function claimPrDescription(db: Db): PrDescription | null {
  return db.transaction((tx) => {
    const busy = tx
      .select({ ticketId: schema.prDescriptions.ticketId })
      .from(schema.prDescriptions)
      .where(eq(schema.prDescriptions.status, 'running'))
      .all()
      .map((row) => row.ticketId);
    const queued = eq(schema.prDescriptions.status, 'queued');
    const next = tx
      .select()
      .from(schema.prDescriptions)
      .where(
        busy.length === 0 ? queued : and(queued, notInArray(schema.prDescriptions.ticketId, busy)),
      )
      .orderBy(asc(schema.prDescriptions.id))
      .get();
    return next ? update(tx, next.id, { status: 'running', startedAt: Date.now() }) : null;
  });
}

/** Records the end of the agent's run: a draft to review, or why there is none. */
export function finishPrDescription(db: Db, id: number, outcome: PrDescriptionOutcome): void {
  update(db, id, {
    status: outcome.status,
    original: outcome.status === 'ready' ? outcome.original : null,
    text: outcome.status === 'ready' ? outcome.text : null,
    error: outcome.status === 'failed' ? outcome.error : null,
    finishedAt: Date.now(),
  });
}

/** Cancels a rewrite still waiting for a slot; false when it already started (its runner stops it). */
export function cancelQueuedPrDescription(db: Db, id: number): boolean {
  const [row] = db
    .update(schema.prDescriptions)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(and(eq(schema.prDescriptions.id, id), eq(schema.prDescriptions.status, 'queued')))
    .returning()
    .all();
  if (!row) {
    return false;
  }
  changed(db, row);
  return true;
}

function requireOpen(db: Executor, id: number): PrDescription {
  const row = db.select().from(schema.prDescriptions).where(eq(schema.prDescriptions.id, id)).get();
  if (!row || !OPEN.some((status) => status === row.status)) {
    throw new PrDescriptionError('There is no rewritten description waiting to be sent');
  }
  return row;
}

/** The user's version of the draft goes out; refused unless a draft waits (`ready`). */
export function startSendingPrDescription(db: Db, id: number, text: string): PrDescription {
  return db.transaction((tx) => {
    const row = requireOpen(tx, id);
    if (row.status !== 'ready') {
      throw new PrDescriptionError(
        'The description changed on GitHub since this draft: rewrite it again',
      );
    }
    if (text.trim() === '') {
      throw new PrDescriptionError('The description is empty');
    }
    return update(tx, id, { status: 'sending', text, error: null });
  });
}

/** How the send went: sent, refused because GitHub's description changed, or failed (kept to retry). */
export function finishSendingPrDescription(db: Db, id: number, outcome: PrDescriptionSent): void {
  if (outcome.status === 'failed') {
    update(db, id, { status: 'ready', error: outcome.error });
    return;
  }
  const row = update(
    db,
    id,
    outcome.status === 'sent'
      ? { status: 'sent', sentAt: Date.now(), error: null }
      : {
          status: 'conflict',
          error: 'The description was edited on GitHub after the agent read it: rewrite it again',
        },
  );
  if (row.status === 'sent') {
    // What `prDescriptionOutdated` compares the pushes with.
    emitEvent(db, {
      type: 'pr_description_sent',
      ticketId: row.ticketId,
      payload: { prNumber: row.prNumber },
    });
  }
}

export function discardPrDescription(db: Db, id: number): void {
  db.transaction((tx) => {
    requireOpen(tx, id);
    update(tx, id, { status: 'discarded', finishedAt: Date.now() });
  });
}

/**
 * What a stopped worker left: running rewrites fail; a send in flight goes back to its draft, since
 * it may or may not have reached GitHub (the next send checks GitHub's description first).
 */
export function recoverPrDescriptions(db: Db): void {
  const rows = db
    .select()
    .from(schema.prDescriptions)
    .where(inArray(schema.prDescriptions.status, ['running', 'sending']))
    .all();
  for (const row of rows) {
    update(
      db,
      row.id,
      row.status === 'running'
        ? {
            status: 'failed',
            error: 'The worker stopped during the rewrite',
            finishedAt: Date.now(),
          }
        : {
            status: 'ready',
            error: 'The worker stopped while sending: check the PR, then send again',
          },
    );
  }
}
