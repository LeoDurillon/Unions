// Reads a project's agent calls and tool uses over a range of days, and says what they show to improve, for its Usage page.
import { and, eq, gte, inArray, or, sql, type SQL } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';
import { toolFindings, type ToolRecord } from './tool-findings';
import { callFindings, type CallRecord, type Finding } from './usage-findings';

const MS_PER_DAY = 86_400_000;

type FindingTicket = { title: string; issueNumber: number | null };

/** The findings, highest first within each, and the tickets they link to. */
export type ProjectFindings = { findings: Finding[]; tickets: Record<number, FindingTicket> };

type At = typeof schema.agentUsage.at | typeof schema.agentToolUsage.at;

/** The rows of the project's tickets and investigations, since `from`. */
function inProject(projectId: number, from: number | null, at: At): SQL | undefined {
  const owned = or(
    eq(schema.tickets.projectId, projectId),
    eq(schema.investigations.projectId, projectId),
  );
  return from === null ? owned : and(owned, gte(at, from));
}

function callsOf(db: Db, projectId: number, from: number | null): CallRecord[] {
  const usage = schema.agentUsage;
  return db
    .select({
      ticketId: usage.ticketId,
      step: schema.runs.step,
      peakContext: usage.peakContext,
      costMicroUsd: sql<number>`coalesce(${usage.costMicroUsd}, 0)`,
    })
    .from(usage)
    .leftJoin(schema.tickets, eq(schema.tickets.id, usage.ticketId))
    .leftJoin(schema.investigations, eq(schema.investigations.id, usage.investigationId))
    .leftJoin(schema.runs, eq(schema.runs.id, usage.runId))
    .where(and(eq(usage.main, true), inProject(projectId, from, usage.at)))
    .all();
}

function toolsOf(db: Db, projectId: number, from: number | null): ToolRecord[] {
  const tools = schema.agentToolUsage;
  return db
    .select({
      ticketId: tools.ticketId,
      tool: tools.tool,
      target: tools.target,
      variant: tools.variant,
      subagent: tools.subagent,
      calls: sql<number>`sum(${tools.calls})`,
      denied: sql<number>`sum(${tools.denied})`,
      resultBytes: sql<number>`sum(${tools.resultBytes})`,
    })
    .from(tools)
    .leftJoin(schema.tickets, eq(schema.tickets.id, tools.ticketId))
    .leftJoin(schema.investigations, eq(schema.investigations.id, tools.investigationId))
    .where(inProject(projectId, from, tools.at))
    .groupBy(tools.ticketId, tools.tool, tools.target, tools.variant, tools.subagent)
    .all();
}

function ticketsOf(db: Db, findings: Finding[]): Record<number, FindingTicket> {
  const ids = [
    ...new Set(findings.flatMap((found) => found.items.flatMap((item) => item.tickets))),
  ];
  if (ids.length === 0) {
    return {};
  }
  const rows = db
    .select({
      id: schema.tickets.id,
      title: schema.tickets.title,
      issueNumber: schema.tickets.issueNumber,
    })
    .from(schema.tickets)
    .where(inArray(schema.tickets.id, ids))
    .all();
  return Object.fromEntries(rows.map(({ id, ...ticket }) => [id, ticket]));
}

/** What the project's agents' last `days` days (null: all) show to improve, as of `now`. */
export function projectFindings(
  db: Db,
  projectId: number,
  days: number | null,
  now = Date.now(),
): ProjectFindings {
  const from = days === null ? null : now - days * MS_PER_DAY;
  const findings = [
    ...callFindings(callsOf(db, projectId, from)),
    ...toolFindings(toolsOf(db, projectId, from)),
  ];
  return { findings, tickets: ticketsOf(db, findings) };
}
