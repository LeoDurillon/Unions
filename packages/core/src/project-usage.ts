// Reads a project's agent usage (its tickets' and its investigations') over a range of days, summed
// for its Usage page.
import { and, eq, gte, or, type SQL } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';
import { summarizeUsage, type ProjectUsage, type UsageRecord } from './usage-summary';

const MS_PER_DAY = 86_400_000;

function recordsOf(db: Db, projectId: number, from: number | null): UsageRecord[] {
  const usage = schema.agentUsage;
  const inProject = or(
    eq(schema.tickets.projectId, projectId),
    eq(schema.investigations.projectId, projectId),
  );
  const where: SQL | undefined = from === null ? inProject : and(inProject, gte(usage.at, from));
  return db
    .select({
      ticketId: usage.ticketId,
      title: schema.tickets.title,
      issueNumber: schema.tickets.issueNumber,
      step: schema.runs.step,
      model: usage.model,
      main: usage.main,
      input: usage.input,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      output: usage.output,
      costMicroUsd: usage.costMicroUsd,
      at: usage.at,
    })
    .from(usage)
    .leftJoin(schema.tickets, eq(schema.tickets.id, usage.ticketId))
    .leftJoin(schema.investigations, eq(schema.investigations.id, usage.investigationId))
    .leftJoin(schema.runs, eq(schema.runs.id, usage.runId))
    .where(where)
    .all();
}

/** The project's usage over the last `days` days (null: all of it), as of `now`. */
export function projectUsage(
  db: Db,
  projectId: number,
  days: number | null,
  now = Date.now(),
): ProjectUsage {
  const from = days === null ? null : now - days * MS_PER_DAY;
  return summarizeUsage(recordsOf(db, projectId, from), from, now);
}
