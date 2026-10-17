// CI output given to the implementer: kept for its next run, or sent now as a revision with the user's note.
import { and, desc, eq, inArray } from 'drizzle-orm';

import { MAX_CI_TEXT_CHARS } from './ci-output-text';
import { revisesImplementer } from './container-runs';
import type { Db } from './db';
import { commands } from './schema';
import * as schema from './schema-ci-outputs';
import { getTicket } from './tickets';

export type CiOutput = typeof schema.ciOutputs.$inferSelect;
export type NewCiOutput = Pick<CiOutput, 'headSha' | 'kind' | 'name' | 'url' | 'text'>;

/** CI output the rules refuse: empty, too long, gone, already read. */
export class CiOutputError extends Error {}

const LISTED = 50;

function checkedItem(item: NewCiOutput): NewCiOutput {
  if (item.text.trim() === '' || item.text.length > MAX_CI_TEXT_CHARS) {
    throw new CiOutputError(`The text must have 1 to ${MAX_CI_TEXT_CHARS} characters`);
  }
  return item;
}

/** The one still waiting for the implementer with the same commit, kind and name, if any. */
function waiting(db: Db, ticketId: number, item: NewCiOutput): CiOutput | undefined {
  const t = schema.ciOutputs;
  return db
    .select()
    .from(t)
    .where(
      and(
        eq(t.ticketId, ticketId),
        eq(t.headSha, item.headSha),
        eq(t.kind, item.kind),
        eq(t.name, item.name),
        eq(t.forAgent, 'next_run'),
      ),
    )
    .get();
}

/** Keeps the items for the implementer's next run; one already waiting gets the newer text. */
export function keepCiOutputs(db: Db, ticketId: number, items: readonly NewCiOutput[]): CiOutput[] {
  if (items.length === 0) {
    throw new CiOutputError('Pick at least one check');
  }
  return db.transaction((tx) =>
    items.map((raw) => {
      const item = checkedItem(raw);
      const old = waiting(tx, ticketId, item);
      if (old) {
        return tx
          .update(schema.ciOutputs)
          .set({ text: item.text, url: item.url })
          .where(eq(schema.ciOutputs.id, old.id))
          .returning()
          .get();
      }
      return tx
        .insert(schema.ciOutputs)
        .values({ ...item, ticketId, forAgent: 'next_run' })
        .returning()
        .get();
    }),
  );
}

/**
 * Keeps the items and queues a revision with the user's note, the worker runs it like any
 * revision. Refused when the ticket cannot go back to the implementer now.
 */
export function sendCiOutputs(
  db: Db,
  ticketId: number,
  items: readonly NewCiOutput[],
  note: string,
): CiOutput[] {
  return db.transaction((tx) => {
    if (!revisesImplementer(getTicket(tx, ticketId).phase)) {
      throw new CiOutputError('The ticket cannot go back to the implementer now');
    }
    const kept = keepCiOutputs(tx, ticketId, items);
    tx.insert(commands)
      .values({ type: 'revise', ticketId, payload: { feedback: note } })
      .run();
    return kept;
  });
}

/** Takes back an output the implementer has not read yet. */
export function dropCiOutput(db: Db, ticketId: number, id: number): CiOutput {
  const row = db
    .select()
    .from(schema.ciOutputs)
    .where(and(eq(schema.ciOutputs.id, id), eq(schema.ciOutputs.ticketId, ticketId)))
    .get();
  if (!row) {
    throw new CiOutputError('No such CI output');
  }
  if (row.forAgent === 'sent') {
    throw new CiOutputError('The agent already read this output');
  }
  return db
    .update(schema.ciOutputs)
    .set({ forAgent: null })
    .where(eq(schema.ciOutputs.id, id))
    .returning()
    .get();
}

/** The ticket's CI outputs given to the implementer (waiting or read), newest first. */
export function listCiOutputs(db: Db, ticketId: number): CiOutput[] {
  const t = schema.ciOutputs;
  return db
    .select()
    .from(t)
    .where(and(eq(t.ticketId, ticketId), inArray(t.forAgent, ['next_run', 'sent'])))
    .orderBy(desc(t.id))
    .limit(LISTED)
    .all();
}
