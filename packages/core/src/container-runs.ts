import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { stripAnsi } from './ansi';
import type { Db } from './db';
import { commands } from './schema';
import * as schema from './schema-container-runs';
import { transition, type Phase } from './states';
import { getTicket } from './tickets';
import { ownerColumns, type WorkspaceOwner } from './workspace-owner';

export type ContainerRun = typeof schema.containerRuns.$inferSelect;

/** A run the rules refuse: a step is running, another run is on, a command too long. */
export class ContainerRunError extends Error {}

export const DEFAULT_RUN_TIMEOUT_SEC = 600;
export const MAX_RUN_TIMEOUT_SEC = 1800;
export const MAX_COMMAND_CHARS = 4000;
/** The output kept: its last lines, at most this many and this many characters. */
export const MAX_OUTPUT_LINES = 500;
export const MAX_OUTPUT_CHARS = 65_536;
const RUNS_LISTED = 20;

const ACTIVE = ['queued', 'running'] as const;

/** The end of a command's output, as kept: colours stripped, the last lines within the limits. */
export function outputTail(lines: readonly string[]): string {
  const kept = lines.slice(-MAX_OUTPUT_LINES).map((line) => stripAnsi(line));
  const text = kept.join('\n');
  return text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text;
}

function timeoutOf(timeoutSec: number | undefined): number {
  if (timeoutSec === undefined) {
    return DEFAULT_RUN_TIMEOUT_SEC;
  }
  if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > MAX_RUN_TIMEOUT_SEC) {
    throw new ContainerRunError(`The timeout must be 1 to ${MAX_RUN_TIMEOUT_SEC} seconds`);
  }
  return timeoutSec;
}

function ownedBy(owner: WorkspaceOwner): SQL {
  return 'ticketId' in owner
    ? eq(schema.containerRuns.ticketId, owner.ticketId)
    : eq(schema.containerRuns.reviewId, owner.reviewId);
}

/** A ticket's workspace is the agent's while a step runs, and gone once the ticket is cancelled. */
function ticketRefusal(db: Db, owner: WorkspaceOwner): string | null {
  if (!('ticketId' in owner)) {
    return null;
  }
  const { phase } = getTicket(db, owner.ticketId);
  if (phase.kind === 'running') {
    return 'A step is running in this workspace: run it once it ends';
  }
  return phase.kind === 'cancelled' ? 'The ticket is cancelled: its workspace is gone' : null;
}

/**
 * Queues a command in the owner's workspace: a ticket's, refused while a step runs (the agent works
 * there), or a pull request's under review. Refused while another command of it is queued or running.
 */
export function queueContainerRun(
  db: Db,
  input: { owner: WorkspaceOwner; command: string; timeoutSec?: number; scriptName?: string },
): ContainerRun {
  const command = input.command.trim();
  if (command === '' || command.length > MAX_COMMAND_CHARS) {
    throw new ContainerRunError(`The command must have 1 to ${MAX_COMMAND_CHARS} characters`);
  }
  const timeoutSec = timeoutOf(input.timeoutSec);
  return db.transaction((tx) => {
    const refusal = ticketRefusal(tx, input.owner);
    if (refusal !== null) {
      throw new ContainerRunError(refusal);
    }
    if (hasActiveContainerRun(tx, input.owner)) {
      throw new ContainerRunError('A command is already running in this workspace');
    }
    return tx
      .insert(schema.containerRuns)
      .values({ ...ownerColumns(input.owner), command, timeoutSec, scriptName: input.scriptName })
      .returning()
      .get();
  });
}

export function getContainerRun(db: Db, id: number): ContainerRun | null {
  return (
    db.select().from(schema.containerRuns).where(eq(schema.containerRuns.id, id)).get() ?? null
  );
}

/** The owner's latest runs, newest first. */
export function listContainerRuns(db: Db, owner: WorkspaceOwner): ContainerRun[] {
  return db
    .select()
    .from(schema.containerRuns)
    .where(ownedBy(owner))
    .orderBy(desc(schema.containerRuns.id))
    .limit(RUNS_LISTED)
    .all();
}

/** The oldest queued run, now running; null when none waits. */
export function claimContainerRun(db: Db): ContainerRun | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.containerRuns)
      .where(eq(schema.containerRuns.status, 'queued'))
      .orderBy(asc(schema.containerRuns.id))
      .get();
    if (!next) {
      return null;
    }
    return tx
      .update(schema.containerRuns)
      .set({ status: 'running', startedAt: Date.now() })
      .where(eq(schema.containerRuns.id, next.id))
      .returning()
      .get();
  });
}

/** The output so far, while the command runs. */
export function updateContainerRunOutput(db: Db, id: number, output: string): void {
  db.update(schema.containerRuns)
    .set({ output })
    .where(and(eq(schema.containerRuns.id, id), eq(schema.containerRuns.status, 'running')))
    .run();
}

export type ContainerRunOutcome = {
  status: 'succeeded' | 'failed' | 'cancelled';
  exitCode: number | null;
  error: string | null;
  output: string;
};

export function finishContainerRun(db: Db, id: number, outcome: ContainerRunOutcome): void {
  db.update(schema.containerRuns)
    .set({ ...outcome, finishedAt: Date.now() })
    .where(eq(schema.containerRuns.id, id))
    .run();
}

/** Cancels a run still waiting; false when it already started (its runner stops it). */
export function cancelQueuedContainerRun(db: Db, id: number): boolean {
  const [row] = db
    .update(schema.containerRuns)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(and(eq(schema.containerRuns.id, id), eq(schema.containerRuns.status, 'queued')))
    .returning()
    .all();
  return row !== undefined;
}

/** Fails the runs a stopped worker left running: nobody reads their output any more. */
export function recoverContainerRuns(db: Db): void {
  db.update(schema.containerRuns)
    .set({ status: 'failed', error: 'The worker stopped during the run', finishedAt: Date.now() })
    .where(eq(schema.containerRuns.status, 'running'))
    .run();
}

function finishedRun(db: Db, id: number): ContainerRun {
  const run = getContainerRun(db, id);
  if (!run) {
    throw new ContainerRunError('Run not found');
  }
  if (run.status === 'queued' || run.status === 'running') {
    throw new ContainerRunError('The command has not finished yet');
  }
  return run;
}

/**
 * Keeps a finished run's output for the implementer's next run (or takes it back). One it already
 * read stays read.
 */
export function keepForAgent(db: Db, id: number, keep: boolean): ContainerRun {
  const run = finishedRun(db, id);
  if (run.ticketId === null) {
    throw new ContainerRunError('A pull request under review has no agent to read it');
  }
  if (run.forAgent === 'sent') {
    throw new ContainerRunError('The agent already read this output');
  }
  return db
    .update(schema.containerRuns)
    .set({ forAgent: keep ? 'next_run' : null })
    .where(eq(schema.containerRuns.id, id))
    .returning()
    .get();
}

/** Whether a revision now goes to the implementer (final review, done, a refused commit of its own). */
export function revisesImplementer(phase: Phase): boolean {
  try {
    const next = transition(phase, { type: 'revise' });
    return next.kind === 'running' && next.step === 'implement';
  } catch {
    return false;
  }
}

/**
 * Sends a finished run's output to the implementer now: kept for its next run, and a revision
 * queued with the user's note (the worker runs it like any revision).
 */
export function sendToAgent(db: Db, id: number, note: string): ContainerRun {
  return db.transaction((tx) => {
    const { ticketId } = finishedRun(tx, id);
    if (ticketId === null) {
      throw new ContainerRunError('A pull request under review has no agent to read it');
    }
    if (!revisesImplementer(getTicket(tx, ticketId).phase)) {
      throw new ContainerRunError('The ticket cannot go back to the implementer now');
    }
    const kept = keepForAgent(tx, id, true);
    tx.insert(commands)
      .values({ type: 'revise', ticketId, payload: { feedback: note } })
      .run();
    return kept;
  });
}

/** The outputs the implementer's next run reads, oldest first. */
export function pendingForAgent(db: Db, ticketId: number): ContainerRun[] {
  return db
    .select()
    .from(schema.containerRuns)
    .where(
      and(
        eq(schema.containerRuns.ticketId, ticketId),
        eq(schema.containerRuns.forAgent, 'next_run'),
      ),
    )
    .orderBy(asc(schema.containerRuns.id))
    .all();
}

/** The implementer read them: they are not given again. */
export function markSentToAgent(db: Db, ids: number[]): void {
  if (ids.length > 0) {
    db.update(schema.containerRuns)
      .set({ forAgent: 'sent' })
      .where(inArray(schema.containerRuns.id, ids))
      .run();
  }
}

/** Whether a command of the owner is queued or running (a ticket's may use the agent's services). */
export function hasActiveContainerRun(db: Db, owner: WorkspaceOwner): boolean {
  return (
    db
      .select({ id: schema.containerRuns.id })
      .from(schema.containerRuns)
      .where(and(ownedBy(owner), inArray(schema.containerRuns.status, ACTIVE)))
      .get() !== undefined
  );
}
