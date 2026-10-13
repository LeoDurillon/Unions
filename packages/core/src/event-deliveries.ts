import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, lte } from 'drizzle-orm';

import type { Db } from './db';
import { triggerMatches } from './event-rules';
import { parseNotionId } from './notion-id';
import * as schema from './tables';
import { emitEvent } from './tickets';

export type EventDelivery = typeof schema.eventDeliveries.$inferSelect;

const CURSOR = 'event_rules';
const BATCH = 500;
/** Rate limits and server errors are tried again, later each time, then given up. */
export const MAX_ATTEMPTS = 5;
const FIRST_RETRY_MS = 30_000;

function cursorOf(db: Db): number | null {
  const row = db
    .select()
    .from(schema.eventCursors)
    .where(eq(schema.eventCursors.name, CURSOR))
    .get();
  return row?.seq ?? null;
}

function moveCursor(db: Pick<Db, 'insert'>, seq: number): void {
  db.insert(schema.eventCursors)
    .values({ name: CURSOR, seq })
    .onConflictDoUpdate({ target: schema.eventCursors.name, set: { seq } })
    .run();
}

/**
 * Reads the events logged since the last call and queues one delivery per matching enabled rule of
 * the ticket's project. A rule only applies to events after its creation; the first call starts at
 * the end of the log (nothing is replayed). Returns how many deliveries were queued.
 */
export function queueDeliveries(db: Db): number {
  const cursor = cursorOf(db);
  if (cursor === null) {
    const last = db.select().from(schema.events).orderBy(desc(schema.events.seq)).get();
    moveCursor(db, last?.seq ?? 0);
    return 0;
  }
  const events = db
    .select()
    .from(schema.events)
    .where(gt(schema.events.seq, cursor))
    .orderBy(asc(schema.events.seq))
    .limit(BATCH)
    .all();
  const last = events.at(-1);
  if (!last) {
    return 0;
  }
  const rules = db
    .select()
    .from(schema.eventRules)
    .where(eq(schema.eventRules.enabled, true))
    .all();
  const projects = new Map(
    db
      .select({ id: schema.tickets.id, projectId: schema.tickets.projectId })
      .from(schema.tickets)
      .all()
      .map((row) => [row.id, row.projectId]),
  );
  let queued = 0;
  db.transaction((tx) => {
    for (const event of events) {
      const projectId = event.ticketId === null ? undefined : projects.get(event.ticketId);
      for (const rule of rules) {
        if (
          rule.projectId === projectId &&
          rule.createdAt <= event.at &&
          triggerMatches(rule.trigger, event)
        ) {
          tx.insert(schema.eventDeliveries)
            .values({ ruleId: rule.id, eventSeq: event.seq, ticketId: event.ticketId })
            .onConflictDoNothing()
            .run();
          queued += 1;
        }
      }
    }
    moveCursor(tx, last.seq);
  });
  return queued;
}

/** The oldest delivery due now, with its rule and the event that triggered it. */
export function nextDelivery(
  db: Db,
  now = Date.now(),
): {
  delivery: EventDelivery;
  rule: typeof schema.eventRules.$inferSelect;
  event: typeof schema.events.$inferSelect;
} | null {
  const delivery = db
    .select()
    .from(schema.eventDeliveries)
    .where(
      and(
        eq(schema.eventDeliveries.status, 'pending'),
        lte(schema.eventDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(schema.eventDeliveries.id))
    .get();
  if (!delivery) {
    return null;
  }
  const rule = db
    .select()
    .from(schema.eventRules)
    .where(eq(schema.eventRules.id, delivery.ruleId))
    .get();
  const event = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.seq, delivery.eventSeq))
    .get();
  if (!rule || !event) {
    finishDelivery(db, delivery, { status: 'failed', error: 'Its rule or event is gone' });
    return nextDelivery(db, now);
  }
  return { delivery, rule, event };
}

export type DeliveryOutcome =
  | { status: 'succeeded' | 'skipped'; detail: string }
  | { status: 'failed'; error: string; detail?: string }
  /** A temporary failure: tried again later, until `MAX_ATTEMPTS`. */
  | { status: 'retry'; error: string };

/** Records what a delivery did; the ticket's log shows it. */
export function finishDelivery(db: Db, delivery: EventDelivery, outcome: DeliveryOutcome): void {
  const attempts = delivery.attempts + 1;
  const retry = outcome.status === 'retry' && attempts < MAX_ATTEMPTS;
  let status: EventDelivery['status'] = retry ? 'pending' : 'failed';
  if (outcome.status !== 'retry') {
    ({ status } = outcome);
  }
  const error = 'error' in outcome ? outcome.error : null;
  const detail = 'detail' in outcome ? (outcome.detail ?? null) : null;
  db.update(schema.eventDeliveries)
    .set({
      status,
      attempts,
      error,
      detail,
      nextAttemptAt: retry
        ? Date.now() + FIRST_RETRY_MS * 2 ** (attempts - 1)
        : delivery.nextAttemptAt,
      finishedAt: retry ? null : Date.now(),
    })
    .where(eq(schema.eventDeliveries.id, delivery.id))
    .run();
  if (status !== 'pending') {
    emitEvent(db, {
      type: 'event_rule_applied',
      ticketId: delivery.ticketId ?? undefined,
      payload: { deliveryId: delivery.id, ruleId: delivery.ruleId, status, detail, error },
    });
  }
}

/** The project's latest deliveries, newest first, for the settings page. */
export function recentDeliveries(db: Db, projectId: number, limit = 50): EventDelivery[] {
  const ruleIds = db
    .select({ id: schema.eventRules.id })
    .from(schema.eventRules)
    .where(eq(schema.eventRules.projectId, projectId))
    .all()
    .map((row) => row.id);
  if (ruleIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(schema.eventDeliveries)
    .where(inArray(schema.eventDeliveries.ruleId, ruleIds))
    .orderBy(desc(schema.eventDeliveries.id))
    .limit(limit)
    .all();
}

const IMPORTED = /^Imported from Notion: (?<url>\S+)\s*$/mu;

/**
 * Links the tickets imported from Notion before the link was stored to their page, from the line
 * the import wrote at the end of their description. Returns how many were linked.
 */
export function backfillNotionPages(db: Db): number {
  const candidates = db
    .select()
    .from(schema.tickets)
    .where(
      and(
        isNull(schema.tickets.notionPageId),
        isNotNull(schema.tickets.body),
        like(schema.tickets.body, '%Imported from Notion: %'),
      ),
    )
    .all();
  let linked = 0;
  for (const ticket of candidates) {
    const url = [...ticket.body.matchAll(new RegExp(IMPORTED, 'gmu'))].at(-1)?.groups?.url;
    const pageId = url ? parseNotionId(url) : null;
    if (pageId) {
      db.update(schema.tickets)
        .set({ notionPageId: pageId })
        .where(eq(schema.tickets.id, ticket.id))
        .run();
      linked += 1;
    }
  }
  return linked;
}
