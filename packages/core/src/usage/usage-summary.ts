// A project's agent usage summed several ways for its Usage page: in all, per week, per step, per
// model, per ticket. Also its investigations. Pure: the rows come from `project-usage.ts`.

import type { Step } from '../states';

/** One `agent_usage` row with what it belongs to. */
export type UsageRecord = {
  ticketId: number | null;
  title: string | null;
  issueNumber: number | null;
  /** The step of the run it was part of; null for a ticket's side work or an investigation. */
  step: Step | null;
  model: string;
  /** The call's own model (one row per call): the row that counts the call. */
  main: boolean;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  costMicroUsd: number | null;
  at: number;
};

/** Calls, tokens and API-equivalent cost (not billed on a subscription). */
export type UsageSlice = { calls: number; input: number; output: number; costUsd: number };

export type ProjectUsage = {
  total: UsageSlice;
  /** Every week (Monday, UTC) from the first to the current, empty ones included. */
  weeks: (UsageSlice & { start: number })[];
  /** Most expensive first; `step` null is the tickets' work outside a step (descriptions, rebases). */
  steps: (UsageSlice & { step: Step | null })[];
  models: (UsageSlice & { model: string })[];
  /** The most expensive tickets, at most `TOP_TICKETS`. */
  tickets: (UsageSlice & { ticketId: number; title: string; issueNumber: number | null })[];
  investigations: UsageSlice;
};

const MICRO = 1_000_000;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = DAYS_PER_WEEK * MS_PER_DAY;
const TOP_TICKETS = 10;

function empty(): UsageSlice {
  return { calls: 0, input: 0, output: 0, costUsd: 0 };
}

function add(slice: UsageSlice, row: UsageRecord): void {
  slice.calls += row.main ? 1 : 0;
  slice.input += row.input + row.cacheRead + row.cacheWrite;
  slice.output += row.output;
  slice.costUsd += (row.costMicroUsd ?? 0) / MICRO;
}

/** The Monday, 00:00 UTC, of the week `ms` falls in. */
export function weekStart(ms: number): number {
  const day = new Date(ms);
  const fromMonday = (day.getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - fromMonday);
}

/** Sums the rows per key, in a map keeping `extra` beside each slice. */
function groupBy<E extends object>(
  rows: UsageRecord[],
  keyOf: (row: UsageRecord) => unknown,
  extra: (row: UsageRecord) => E,
): (UsageSlice & E)[] {
  const groups = new Map<unknown, UsageSlice & E>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { ...empty(), ...extra(row) };
    add(group, row);
    groups.set(key, group);
  }
  return [...groups.values()].toSorted((a, b) => b.costUsd - a.costUsd);
}

function weeksOf(rows: UsageRecord[], from: number | null, now: number): ProjectUsage['weeks'] {
  const first = from ?? Math.min(...rows.map((row) => row.at));
  if (!Number.isFinite(first)) {
    return [];
  }
  const weeks = new Map<number, UsageSlice & { start: number }>();
  for (let start = weekStart(first); start <= now; start += MS_PER_WEEK) {
    weeks.set(start, { ...empty(), start });
  }
  for (const row of rows) {
    const week = weeks.get(weekStart(row.at));
    if (week) {
      add(week, row);
    }
  }
  return [...weeks.values()];
}

/** The rows summed every way the Usage page shows; `from` is where the range starts (null: the first row). */
export function summarizeUsage(
  rows: UsageRecord[],
  from: number | null,
  now: number,
): ProjectUsage {
  const total = empty();
  const investigations = empty();
  for (const row of rows) {
    add(total, row);
    if (row.ticketId === null) {
      add(investigations, row);
    }
  }
  const onTickets = rows.filter((row) => row.ticketId !== null);
  return {
    total,
    weeks: weeksOf(rows, from, now),
    steps: groupBy(
      onTickets,
      (row) => row.step,
      (row) => ({ step: row.step }),
    ),
    models: groupBy(
      rows,
      (row) => row.model,
      (row) => ({ model: row.model }),
    ),
    tickets: groupBy(
      onTickets,
      (row) => row.ticketId,
      (row) => ({
        ticketId: row.ticketId ?? 0,
        title: row.title ?? '',
        issueNumber: row.issueNumber,
      }),
    ).slice(0, TOP_TICKETS),
    investigations,
  };
}
