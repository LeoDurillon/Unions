// What a ticket's or an investigation's agent calls used, per run and per call, summed for the Usage tables.
import { asc, eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

type UsageRow = typeof schema.agentUsage.$inferSelect;

export type UsageModel = {
  model: string;
  main: boolean;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
  costUsd: number | null;
};

/** One `claude -p` call: its models (main first) and its own figures. */
export type UsageCall = {
  id: number;
  at: number;
  models: UsageModel[];
  turns: number | null;
  durationMs: number | null;
  peakContext: number | null;
  contextWindow: number | null;
  failed: boolean;
};

export type UsageTotals = Omit<UsageModel, 'model' | 'main'> & { calls: number; turns: number };

/** A ticket's step run (`runId`), its side runs (`runId` null), or one call of an investigation. */
export type UsageGroup = {
  key: string;
  runId: number | null;
  calls: UsageCall[];
  total: UsageTotals;
};

export type UsageView = { groups: UsageGroup[]; total: UsageTotals };

export type UsageOwner = { ticketId: number } | { investigationId: number };

const MICRO = 1_000_000;

function emptyTotals(): UsageTotals {
  return {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    thinking: 0,
    costUsd: null,
    calls: 0,
    turns: 0,
  };
}

function toModel(row: UsageRow): UsageModel {
  const { model, main, input, cacheRead, cacheWrite, output, thinking, costMicroUsd } = row;
  const costUsd = costMicroUsd === null ? null : costMicroUsd / MICRO;
  return { model, main, input, cacheRead, cacheWrite, output, thinking, costUsd };
}

/** The rows of one call, in one entry; its own figures are on its main model's row. */
function toCalls(rows: UsageRow[]): UsageCall[] {
  const calls = new Map<number, UsageCall>();
  for (const row of rows) {
    const call = calls.get(row.resultLineId) ?? {
      id: row.resultLineId,
      at: row.at,
      models: [],
      turns: null,
      durationMs: null,
      peakContext: null,
      contextWindow: null,
      failed: false,
    };
    call.models.push(toModel(row));
    if (row.main) {
      Object.assign(call, {
        turns: row.turns,
        durationMs: row.durationMs,
        peakContext: row.peakContext,
        contextWindow: row.contextWindow,
        failed: row.failed,
      });
    }
    calls.set(row.resultLineId, call);
  }
  for (const call of calls.values()) {
    call.models.sort((a, b) => Number(b.main) - Number(a.main));
  }
  return [...calls.values()];
}

/** Every model of every call, added up; the cost stays null only when no call reported one. */
export function sumCalls(calls: UsageCall[]): UsageTotals {
  const total = emptyTotals();
  for (const call of calls) {
    total.calls += 1;
    total.turns += call.turns ?? 0;
    for (const model of call.models) {
      total.input += model.input;
      total.cacheRead += model.cacheRead;
      total.cacheWrite += model.cacheWrite;
      total.output += model.output;
      total.thinking += model.thinking;
      if (model.costUsd !== null) {
        total.costUsd = (total.costUsd ?? 0) + model.costUsd;
      }
    }
  }
  return total;
}

function group(key: string, runId: number | null, calls: UsageCall[]): UsageGroup {
  return { key, runId, calls, total: sumCalls(calls) };
}

/**
 * A ticket's calls by step run, then its side runs (agent review, grouping, PR description) in one
 * group; an investigation's, one group per call.
 */
export function groupUsage(rows: UsageRow[], byCall: boolean): UsageView {
  const calls = toCalls(rows);
  const runOf = new Map(rows.map((row) => [row.resultLineId, row.runId]));
  const groups: UsageGroup[] = [];
  if (byCall) {
    groups.push(...calls.map((call) => group(`call-${call.id}`, null, [call])));
  } else {
    const runIds = [...new Set(calls.map((call) => runOf.get(call.id) ?? null))];
    for (const runId of runIds.filter((id) => id !== null)) {
      groups.push(
        group(
          `run-${runId}`,
          runId,
          calls.filter((call) => runOf.get(call.id) === runId),
        ),
      );
    }
    const side = calls.filter((call) => (runOf.get(call.id) ?? null) === null);
    if (side.length > 0) {
      groups.push(group('side', null, side));
    }
  }
  return { groups, total: sumCalls(calls) };
}

export function usageOf(db: Db, owner: UsageOwner): UsageView {
  const where =
    'ticketId' in owner
      ? eq(schema.agentUsage.ticketId, owner.ticketId)
      : eq(schema.agentUsage.investigationId, owner.investigationId);
  const rows = db
    .select()
    .from(schema.agentUsage)
    .where(where)
    .orderBy(asc(schema.agentUsage.resultLineId))
    .all();
  return groupUsage(rows, 'investigationId' in owner);
}
