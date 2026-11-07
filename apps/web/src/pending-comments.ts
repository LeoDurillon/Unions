// The comments a ticket's tracker tab is still sending: queued commands the worker has not answered with an event yet.
import { schema, type Db } from '@union/core';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

/** A comment still unanswered after this is no longer shown pending: the worker stopped while posting it. */
const STALE_COMMENT_MS = 600_000;

/** A command type, the two events that answer it (posted, failed), and how to read its payload. */
export type CommentCommand<T> = {
  type: string;
  answers: [string, string];
  parse: (payload: unknown) => T;
};

function commandIdOf(payload: unknown): number | null {
  const value =
    typeof payload === 'object' && payload !== null && 'commandId' in payload
      ? payload.commandId
      : null;
  return typeof value === 'number' ? value : null;
}

/** The commands answered on the ticket since `since`. */
function answered(db: Db, ticketId: number, answers: string[], since: number): Set<number> {
  const events = db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.ticketId, ticketId),
        inArray(schema.events.type, answers),
        gte(schema.events.at, since),
      ),
    )
    .all();
  return new Set(events.flatMap((event) => commandIdOf(event.payload) ?? []));
}

/** The ticket's comments of this kind the worker has not posted yet ("Sending…", across reloads). */
export function pendingComments<T>(
  db: Db,
  ticketId: number,
  command: CommentCommand<T>,
  now = Date.now(),
): { commandId: number; createdAt: number; post: T }[] {
  const since = now - STALE_COMMENT_MS;
  const commands = db
    .select()
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.type, command.type),
        eq(schema.commands.ticketId, ticketId),
        gte(schema.commands.createdAt, since),
        isNull(schema.commands.error),
      ),
    )
    .all();
  const done = answered(db, ticketId, command.answers, since);
  return commands.flatMap((row) => {
    if (done.has(row.id)) {
      return [];
    }
    try {
      return [{ commandId: row.id, createdAt: row.createdAt, post: command.parse(row.payload) }];
    } catch {
      return [];
    }
  });
}
