// The lifecycle the review side runs share (agent reviews, groupings, reports, explanations, review agents): claim, cancel, fail the interrupted.
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { Db } from './db';
import type { emitEvent } from './tickets';

type Executor = Parameters<typeof emitEvent>[0];

/** The columns every review run table has (`reviewOwnerColumns`, `runStatusColumn`, the timestamps). */
type ReviewRunTable = SQLiteTable & {
  id: SQLiteColumn;
  status: SQLiteColumn;
  startedAt: SQLiteColumn;
  finishedAt: SQLiteColumn;
};

/** What a kind of review run gives the shared lifecycle; its rows stay typed through `load`. */
export type ReviewRunLife<Row extends { id: number }> = {
  table: ReviewRunTable;
  load: (db: Executor, id: number) => Row | undefined;
  /** The row's change as an event: the review page refreshes on it. */
  changed: (db: Executor, row: Row) => void;
  /** The kind's own finish, as a failure with `error` (it clears the kind's result columns). */
  fail: (db: Db, id: number, error: string) => void;
  /** Names the run in "The worker stopped during the {noun}". */
  noun: string;
  /**
   * Of the rows queued or running, oldest first, the one to start. By default the oldest queued;
   * explanations skip a review that already has one running.
   */
  pick?: (active: Row[]) => Row | undefined;
};

const ACTIVE = ['queued', 'running'];

function idOf(row: { id: unknown }): number | null {
  return typeof row.id === 'number' ? row.id : null;
}

/** The ids of the kind's rows in `statuses`, oldest first. */
function idsIn(db: Executor, table: ReviewRunTable, statuses: string[]): number[] {
  return db
    .select({ id: table.id })
    .from(table)
    .where(inArray(table.status, statuses))
    .orderBy(asc(table.id))
    .all()
    .map((row) => idOf(row))
    .filter((id) => id !== null);
}

/** The property name drizzle's `set` wants for `column` (`startedAt`, not `started_at`). */
function keyOf(table: ReviewRunTable, column: SQLiteColumn): string {
  const found = Object.entries(getTableColumns(table)).find(([, value]) => value === column);
  if (!found) {
    throw new Error(`Column ${column.name} is not in its table`);
  }
  return found[0];
}

/** Sets the row's status and one timestamp column when it is still in `from`; whether it was. */
function move(
  db: Executor,
  table: ReviewRunTable,
  id: number,
  change: { from: string; to: string; stamp: SQLiteColumn },
): boolean {
  const moved = db
    .update(table)
    .set({
      [keyOf(table, table.status)]: change.to,
      [keyOf(table, change.stamp)]: Date.now(),
    })
    .where(and(eq(table.id, id), eq(table.status, change.from)))
    .returning({ id: table.id })
    .all();
  return moved.length > 0;
}

function loaded<Row extends { id: number }>(
  db: Executor,
  life: ReviewRunLife<Row>,
  ids: number[],
): Row[] {
  return ids.map((id) => life.load(db, id)).filter((row) => row !== undefined);
}

/** The next run to start, now running; null when none can start. */
export function claimReviewRun<Row extends { id: number; status: string }>(
  db: Db,
  life: ReviewRunLife<Row>,
): Row | null {
  return db.transaction((tx) => {
    const active = loaded(tx, life, idsIn(tx, life.table, ACTIVE));
    const next = life.pick ? life.pick(active) : active.find((row) => row.status === 'queued');
    if (
      !next ||
      !move(tx, life.table, next.id, { from: 'queued', to: 'running', stamp: life.table.startedAt })
    ) {
      return null;
    }
    const claimed = life.load(tx, next.id);
    if (claimed) {
      life.changed(tx, claimed);
    }
    return claimed ?? null;
  });
}

/** Cancels a run still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedReviewRun<Row extends { id: number }>(
  db: Db,
  life: ReviewRunLife<Row>,
  id: number,
): boolean {
  if (
    !move(db, life.table, id, { from: 'queued', to: 'cancelled', stamp: life.table.finishedAt })
  ) {
    return false;
  }
  const row = life.load(db, id);
  if (row) {
    life.changed(db, row);
  }
  return true;
}

/** Fails the runs a stopped worker left running, and returns them (for their containers to go). */
export function failInterruptedReviewRuns<Row extends { id: number }>(
  db: Db,
  life: ReviewRunLife<Row>,
): Row[] {
  const running = loaded(db, life, idsIn(db, life.table, ['running']));
  for (const row of running) {
    life.fail(db, row.id, `The worker stopped during the ${life.noun}`);
  }
  return running;
}
