// How much of the Claude subscription's usage windows (five hours, seven days) is used, as the last
// `rate_limit_event` an agent call printed reported it. Union learns it only while its agents run.
import { and, desc, gt, max, sql } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

export type LimitWindow = {
  /** 0 to 1. */
  utilization: number;
  /** When the window starts over, in ms. */
  resetsAt: number;
};

export type ClaudeLimits = {
  /** `allowed`, `allowed_warning` (close to a limit) or `rejected` (a limit was reached). */
  status: string;
  fiveHour: LimitWindow | null;
  sevenDay: LimitWindow | null;
  /** When the agent call reported it, in ms. */
  at: number;
};

const MS_PER_SECOND = 1000;
/** How far back from the newest agent line a report is looked for: a bound on a scan with none. */
const LOOKBACK_LINES = 20_000;
/** Reports read at most: an older format without windows is skipped for the one before. */
const RECENT_REPORTS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function windowOf(value: unknown): LimitWindow | null {
  if (!isRecord(value)) {
    return null;
  }
  const { utilization, resetsAt } = value;
  if (typeof utilization !== 'number' || typeof resetsAt !== 'number') {
    return null;
  }
  return { utilization, resetsAt: resetsAt * MS_PER_SECOND };
}

/** A `rate_limit_event`'s windows and status; null for any other line, or one without windows. */
export function parseRateLimit(payload: unknown, at: number): ClaudeLimits | null {
  if (!isRecord(payload) || payload.type !== 'rate_limit_event') {
    return null;
  }
  const info = payload.rate_limit_info;
  if (!isRecord(info) || !isRecord(info.unifiedWindows)) {
    return null;
  }
  const fiveHour = windowOf(info.unifiedWindows.five_hour);
  const sevenDay = windowOf(info.unifiedWindows.seven_day);
  if (!fiveHour && !sevenDay) {
    return null;
  }
  const status = typeof info.status === 'string' ? info.status : 'allowed';
  return { status, fiveHour, sevenDay, at };
}

/** The newest report of the subscription's usage, or null when no agent call made one lately. */
export function latestClaudeLimits(db: Db): ClaudeLimits | null {
  const newest = db
    .select({ id: max(schema.agentLog.id) })
    .from(schema.agentLog)
    .get();
  const rows = db
    .select({ payload: schema.agentLog.payload, at: schema.agentLog.at })
    .from(schema.agentLog)
    .where(
      and(
        gt(schema.agentLog.id, (newest?.id ?? 0) - LOOKBACK_LINES),
        sql`json_extract(${schema.agentLog.payload}, '$.type') = 'rate_limit_event'`,
      ),
    )
    .orderBy(desc(schema.agentLog.id))
    .limit(RECENT_REPORTS)
    .all();
  for (const row of rows) {
    const limits = parseRateLimit(row.payload, row.at);
    if (limits) {
      return limits;
    }
  }
  return null;
}
