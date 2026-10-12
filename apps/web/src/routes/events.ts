import { schema, type Db } from '@union/core';
import { and, asc, eq, gt, max, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

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
   * SSE: tail `events` by seq. `Last-Event-ID` (or ?after=) resumes without gaps.
   * Optional ?ticket=<id> or ?investigation=<id> filters to one ticket or investigation.
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
          await stream.writeSSE({
            id: String(row.seq),
            event: row.type,
            data: JSON.stringify(row),
          });
        }
        if (rows.length < BATCH) {
          await stream.sleep(POLL_MS);
        }
      }
    });
  });

  return routes;
}
