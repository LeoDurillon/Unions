// What each running agent of a project is doing now: the last thing it wrote or the last tool it
// called. Also when its run started. Read by the board, which polls it while a ticket runs.
import { and, desc, eq, sql } from 'drizzle-orm';

import { latestActivity, type ActivityLine } from './agent-activity';
import type { Db } from './db';
import * as schema from './tables';

export type RunProgress = {
  ticketId: number;
  step: string;
  /** When the run started, in ms. */
  startedAt: number;
  /** The agent's latest message or tool call, and when it was written; null before its first. */
  latest: (ActivityLine & { at: number }) | null;
};

/** How far back from a run's last line the latest assistant message is looked for. */
const LOOKBACK = 50;

function latestOf(db: Db, ticketId: number, runId: number): RunProgress['latest'] {
  const lines = db
    .select({ payload: schema.agentLog.payload, at: schema.agentLog.at })
    .from(schema.agentLog)
    .where(
      and(
        eq(schema.agentLog.ticketId, ticketId),
        eq(schema.agentLog.runId, runId),
        sql`json_extract(${schema.agentLog.payload}, '$.type') = 'assistant'`,
      ),
    )
    .orderBy(desc(schema.agentLog.id))
    .limit(LOOKBACK)
    .all();
  for (const line of lines) {
    const activity = latestActivity(line.payload);
    if (activity) {
      return { ...activity, at: line.at };
    }
  }
  return null;
}

/** The project's runs in progress, one per ticket (its newest), each with its agent's latest activity. */
export function projectRunProgress(db: Db, projectId: number): RunProgress[] {
  const running = db
    .select({
      id: schema.runs.id,
      ticketId: schema.runs.ticketId,
      step: schema.runs.step,
      startedAt: schema.runs.startedAt,
    })
    .from(schema.runs)
    .innerJoin(schema.tickets, eq(schema.tickets.id, schema.runs.ticketId))
    .where(and(eq(schema.tickets.projectId, projectId), eq(schema.runs.status, 'running')))
    .orderBy(desc(schema.runs.id))
    .all();
  const seen = new Set<number>();
  return running.flatMap((run) => {
    if (seen.has(run.ticketId)) {
      return [];
    }
    seen.add(run.ticketId);
    return [
      {
        ticketId: run.ticketId,
        step: run.step,
        startedAt: run.startedAt,
        latest: latestOf(db, run.ticketId, run.id),
      },
    ];
  });
}
