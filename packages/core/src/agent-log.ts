// Writes the agents' output to `agent_log`, and reads a Log: events and agent lines in one order.
import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

export type AgentLine = typeof schema.agentLog.$inferSelect;
export type EventRecord = typeof schema.events.$inferSelect;

/** Whose Log: a ticket's or an investigation's. */
export type LogOwner = { ticketId: number } | { investigationId: number };

/** How far a reader got in each table. */
export type LogCursor = { seq: number; line: number };

export type LogEntry =
  | { source: 'event'; event: EventRecord }
  | { source: 'agent'; line: AgentLine };

/** Logs one line of an agent's output, after the last event logged so far. */
export function appendAgentLine(
  db: Db,
  line: { ticketId?: number; runId?: number; investigationId?: number; payload: unknown },
): void {
  db.insert(schema.agentLog)
    .values({
      afterSeq: sql`(SELECT coalesce(max(${schema.events.seq}), 0) FROM ${schema.events})`,
      ticketId: line.ticketId ?? null,
      runId: line.runId ?? null,
      investigationId: line.investigationId ?? null,
      payload: line.payload,
    })
    .run();
}

function eventsOf(owner: LogOwner): SQL {
  return 'ticketId' in owner
    ? eq(schema.events.ticketId, owner.ticketId)
    : eq(schema.events.investigationId, owner.investigationId);
}

function linesOf(owner: LogOwner): SQL {
  return 'ticketId' in owner
    ? eq(schema.agentLog.ticketId, owner.ticketId)
    : eq(schema.agentLog.investigationId, owner.investigationId);
}

/** Both lists in log order: a line comes after the event it was written after, before the next. */
export function mergeLog(events: EventRecord[], lines: AgentLine[]): LogEntry[] {
  const merged: LogEntry[] = [];
  let next = 0;
  for (const event of events) {
    for (
      let line = lines[next];
      line !== undefined && line.afterSeq < event.seq;
      line = lines[next]
    ) {
      merged.push({ source: 'agent', line });
      next += 1;
    }
    merged.push({ source: 'event', event });
  }
  for (const line of lines.slice(next)) {
    merged.push({ source: 'agent', line });
  }
  return merged;
}

/**
 * The owner's Log after `after`, oldest first, and the cursor to ask from next. Both tables are read
 * in one transaction: a line written later is always after every event returned here.
 */
export function readLog(
  db: Db,
  owner: LogOwner,
  after: LogCursor,
): { entries: LogEntry[]; cursor: LogCursor } {
  return db.transaction((tx) => {
    const events = tx
      .select()
      .from(schema.events)
      .where(and(eventsOf(owner), gt(schema.events.seq, after.seq)))
      .orderBy(asc(schema.events.seq))
      .all();
    const lines = tx
      .select()
      .from(schema.agentLog)
      .where(and(linesOf(owner), gt(schema.agentLog.id, after.line)))
      .orderBy(asc(schema.agentLog.id))
      .all();
    return {
      entries: mergeLog(events, lines),
      cursor: { seq: events.at(-1)?.seq ?? after.seq, line: lines.at(-1)?.id ?? after.line },
    };
  });
}
