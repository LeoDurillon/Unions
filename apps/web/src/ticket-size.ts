// A ticket's change as its Overview shows it: lines of code added against its budget, from its latest diff snapshot.
import {
  changeBudget,
  isEvent,
  measureChange,
  schema,
  sizeIgnoreOf,
  type Db,
  type ProjectConfig,
} from '@union/core';
import { and, desc, eq } from 'drizzle-orm';

import type { TicketSize } from './api-size-types';

/** The lines of code before the last trim pass, when the last measure was one. */
function trimmedFrom(db: Db, ticketId: number): number | null {
  const [last, before] = db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.ticketId, ticketId), eq(schema.events.type, 'change_measured')))
    .orderBy(desc(schema.events.seq))
    .limit(2)
    .all()
    .filter((event) => isEvent(event, 'change_measured'))
    .map((event) => event.payload);
  return last?.phase === 'trimmed' && before ? before.code : null;
}

/** Null before the first implementation captured a diff. */
export function ticketSize(db: Db, ticketId: number, config: ProjectConfig): TicketSize | null {
  const snapshot = db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  if (!snapshot) {
    return null;
  }
  const files = db
    .select({
      path: schema.diffFiles.path,
      additions: schema.diffFiles.additions,
      deletions: schema.diffFiles.deletions,
      binary: schema.diffFiles.binary,
    })
    .from(schema.diffFiles)
    .where(eq(schema.diffFiles.snapshotId, snapshot.id))
    .all();
  const technical = db
    .select()
    .from(schema.stepOutputs)
    .where(and(eq(schema.stepOutputs.ticketId, ticketId), eq(schema.stepOutputs.step, 'technical')))
    .all()
    .findLast((output) => output.validation === 'approved');
  return {
    ...measureChange(files, sizeIgnoreOf(config)),
    budget: changeBudget(technical?.content ?? null, config),
    trimmedFrom: trimmedFrom(db, ticketId),
  };
}
