// Records an agent call's tool uses (`agent_tool_usage`) from its lines in `agent_log`, live or replayed from the past.
import { and, asc, gt, lt, notInArray, or, sql } from 'drizzle-orm';

import { countToolCalls } from './agent-tool-calls';
import { parseResult } from './agent-usage';
import { ofType, previousResult, sameSession, type Executor } from './agent-usage-record';
import type { Db } from './db';
import * as schema from './tables';

type AgentLine = typeof schema.agentLog.$inferSelect;

const PERMISSION_DENIED = sql`json_extract(${schema.agentLog.payload}, '$.subtype') = 'permission_denied'`;

/** The call's own lines: its tool uses, their results and refusals, since the session's previous result. */
function callLines(db: Executor, line: AgentLine, sessionId: string): unknown[] | null {
  const session = sameSession(line, sessionId);
  if (!session) {
    return null;
  }
  const previous = previousResult(db, line, session);
  return db
    .select({ payload: schema.agentLog.payload })
    .from(schema.agentLog)
    .where(
      and(
        session,
        or(ofType('assistant'), ofType('user'), PERMISSION_DENIED),
        gt(schema.agentLog.id, previous?.id ?? 0),
        lt(schema.agentLog.id, line.id),
      ),
    )
    .orderBy(asc(schema.agentLog.id))
    .all()
    .map((row) => row.payload);
}

/**
 * Records the tool uses of the call a `result` line ends, once: a call already recorded is left as
 * it is. Returns how many tool keys it recorded.
 */
export function recordToolUsage(db: Executor, line: AgentLine): number {
  const result = parseResult(line.payload);
  const payloads = result && callLines(db, line, result.sessionId);
  if (!result || !payloads) {
    return 0;
  }
  const counts = countToolCalls(payloads);
  for (const count of counts) {
    db.insert(schema.agentToolUsage)
      .values({
        resultLineId: line.id,
        ticketId: line.ticketId,
        runId: line.runId,
        investigationId: line.investigationId,
        sessionId: result.sessionId,
        ...count,
        at: line.at,
      })
      .onConflictDoNothing()
      .run();
  }
  return counts.length;
}

/** Records the tool uses of every past call not recorded yet, oldest first. */
export function backfillToolUsage(db: Db): { read: number; recorded: number } {
  const done = db
    .selectDistinct({ id: schema.agentToolUsage.resultLineId })
    .from(schema.agentToolUsage);
  const lines = db
    .select()
    .from(schema.agentLog)
    .where(and(ofType('result'), notInArray(schema.agentLog.id, done)))
    .orderBy(asc(schema.agentLog.id))
    .all();
  let recorded = 0;
  for (const line of lines) {
    recorded += db.transaction((tx) => (recordToolUsage(tx, line) > 0 ? 1 : 0));
  }
  return { read: lines.length, recorded };
}
