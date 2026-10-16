// The API route that streams new events to the browser as server-sent events.
import { readLog, schema, type Db, type LogCursor, type LogOwner } from '@union/core';
import { and, asc, eq, gt, max, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { BAD_REQUEST } from '../http';

const POLL_MS = 200;
const BATCH = 200;

function latestSeq(db: Db): number {
  const row = db
    .select({ seq: max(schema.events.seq) })
    .from(schema.events)
    .get();
  return row?.seq ?? 0;
}

/** `after=latest` starts at the current end of the log, so live views do not replay history. */
function startCursor(db: Db, after: string | undefined): number {
  return after === 'latest' ? latestSeq(db) : Number(after ?? 0);
}

/** One ticket's events, one investigation's, or (neither given) all of them. */
function eventFilter(
  ticket: string | undefined,
  investigation: string | undefined,
): SQL | undefined {
  if (ticket) {
    return eq(schema.events.ticketId, Number(ticket));
  }
  return investigation ? eq(schema.events.investigationId, Number(investigation)) : undefined;
}

const CURSOR = /^(?<seq>\d+)\.(?<line>\d+)$/u;

/** `after=<seq>.<line>`, as the last read of a Log returned it; none reads the whole Log. */
function logCursor(after: string | undefined): LogCursor | null {
  if (after === undefined) {
    return { seq: 0, line: 0 };
  }
  const groups = CURSOR.exec(after)?.groups;
  return groups ? { seq: Number(groups.seq), line: Number(groups.line) } : null;
}

function logOwner(ticket: string | undefined, investigation: string | undefined): LogOwner | null {
  if (ticket) {
    return { ticketId: Number(ticket) };
  }
  return investigation ? { investigationId: Number(investigation) } : null;
}

export function eventRoutes(db: Db): Hono {
  const routes = new Hono();

  /** Where a new board subscriber should start, so it does not replay the whole history. */
  routes.get('/cursor', (c) => {
    const row = db
      .select({ seq: max(schema.events.seq) })
      .from(schema.events)
      .get();
    return c.json({ seq: row?.seq ?? 0 });
  });

  /**
   * One ticket's or one investigation's Log after `?after=`, oldest first: its events and its agents'
   * output (`agent_log`) in one order, and the cursor to ask from next. The Log tabs poll it while
   * open; agent output stays off the shared stream, so the board does not receive it.
   */
  routes.get('/log', (c) => {
    const owner = logOwner(c.req.query('ticket'), c.req.query('investigation'));
    const after = logCursor(c.req.query('after'));
    if (!owner || !after) {
      return c.json(
        { error: 'Give ?ticket=<id> or ?investigation=<id>, and ?after=<seq>.<line> or none' },
        BAD_REQUEST,
      );
    }
    const { entries, cursor } = readLog(db, owner, after);
    return c.json({ entries, cursor: `${cursor.seq}.${cursor.line}` });
  });

  /**
   * SSE: tail `events` by seq. `Last-Event-ID` (or ?after=) resumes without gaps.
   * Optional ?ticket=<id> or ?investigation=<id> filters to one ticket or investigation.
   * Events are sent unnamed (the row carries its `type`), so a client receives every type,
   * including ones added later, without listing them.
   */
  routes.get('/', (c) => {
    let cursor = startCursor(db, c.req.header('last-event-id') ?? c.req.query('after'));
    const filter = eventFilter(c.req.query('ticket'), c.req.query('investigation'));

    return streamSSE(c, async (stream) => {
      while (!stream.aborted) {
        const rows = db
          .select()
          .from(schema.events)
          .where(and(gt(schema.events.seq, cursor), filter))
          .orderBy(asc(schema.events.seq))
          .limit(BATCH)
          .all();
        for (const row of rows) {
          cursor = row.seq;
          await stream.writeSSE({ id: String(row.seq), data: JSON.stringify(row) });
        }
        if (rows.length < BATCH) {
          await stream.sleep(POLL_MS);
        }
      }
    });
  });

  return routes;
}
