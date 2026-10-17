// Records an agent call's usage from its `result` line in `agent_log`, live or replayed from the past.
import { and, asc, desc, eq, gt, lt, notInArray, sql, type SQL } from 'drizzle-orm';

import {
  callUsage,
  parseResult,
  parseTurn,
  peakOf,
  type CallUsage,
  type Turn,
} from './agent-usage';
import type { Db } from './db';
import * as schema from './tables';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
type AgentLine = typeof schema.agentLog.$inferSelect;

const MICRO = 1_000_000;

/** The lines of the same Log (a ticket's or an investigation's) and Claude session. */
function sameSession(line: AgentLine, sessionId: string): SQL | undefined {
  const owner = ownerOf(line);
  return owner
    ? and(owner, sql`json_extract(${schema.agentLog.payload}, '$.session_id') = ${sessionId}`)
    : undefined;
}

function ownerOf(line: AgentLine): SQL | null {
  if (line.ticketId !== null) {
    return eq(schema.agentLog.ticketId, line.ticketId);
  }
  return line.investigationId === null
    ? null
    : eq(schema.agentLog.investigationId, line.investigationId);
}

function ofType(type: string): SQL {
  return sql`json_extract(${schema.agentLog.payload}, '$.type') = ${type}`;
}

/** The session's result before this one, and the call's own turns since. */
function before(
  db: Executor,
  line: AgentLine,
  session: SQL,
): { previous: AgentLine | undefined; turns: Turn[] } {
  const previous = db
    .select()
    .from(schema.agentLog)
    .where(and(session, ofType('result'), lt(schema.agentLog.id, line.id)))
    .orderBy(desc(schema.agentLog.id))
    .limit(1)
    .get();
  const turns = db
    .select({ payload: schema.agentLog.payload })
    .from(schema.agentLog)
    .where(
      and(
        session,
        ofType('assistant'),
        gt(schema.agentLog.id, previous?.id ?? 0),
        lt(schema.agentLog.id, line.id),
      ),
    )
    .orderBy(asc(schema.agentLog.id))
    .all()
    .map((row) => parseTurn(row.payload))
    .filter((turn) => turn !== null);
  return { previous, turns };
}

function micro(costUsd: number | null): number | null {
  return costUsd === null ? null : Math.round(costUsd * MICRO);
}

/**
 * Records the call a `result` line ends, once: a line already recorded is left as it is. Returns
 * whether the line was a call's result with something to record.
 */
export function recordUsage(db: Executor, line: AgentLine): boolean {
  const result = parseResult(line.payload);
  const session = result && sameSession(line, result.sessionId);
  if (!result || !session) {
    return false;
  }
  const { previous, turns } = before(db, line, session);
  const { peak, model } = peakOf(turns);
  const usages = callUsage(result, previous ? parseResult(previous.payload) : null, model);
  const own = (usage: CallUsage): Partial<typeof schema.agentUsage.$inferInsert> =>
    usage.main
      ? {
          turns: result.turns,
          durationMs: result.durationMs,
          apiDurationMs: result.apiDurationMs,
          peakContext: peak,
          failed: result.failed,
        }
      : {};
  for (const usage of usages) {
    const { costUsd, contextWindow, ...tokens } = usage.tokens;
    db.insert(schema.agentUsage)
      .values({
        resultLineId: line.id,
        ticketId: line.ticketId,
        runId: line.runId,
        investigationId: line.investigationId,
        sessionId: result.sessionId,
        model: usage.model,
        main: usage.main,
        ...tokens,
        costMicroUsd: micro(costUsd),
        contextWindow,
        ...own(usage),
        at: line.at,
      })
      .onConflictDoNothing()
      .run();
  }
  return usages.length > 0;
}

/**
 * Records every past call not recorded yet, oldest first. A call that used nothing and named no
 * model has no row, so it is read again next time.
 */
export function backfillUsage(db: Db): { read: number; recorded: number } {
  const done = db.selectDistinct({ id: schema.agentUsage.resultLineId }).from(schema.agentUsage);
  const lines = db
    .select()
    .from(schema.agentLog)
    .where(and(ofType('result'), notInArray(schema.agentLog.id, done)))
    .orderBy(asc(schema.agentLog.id))
    .all();
  let recorded = 0;
  for (const line of lines) {
    recorded += db.transaction((tx) => (recordUsage(tx, line) ? 1 : 0));
  }
  return { read: lines.length, recorded };
}
