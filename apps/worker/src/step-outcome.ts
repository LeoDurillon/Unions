// A step's result from an agent call that hit the usage limit, and when the scheduler retries it.

import { latestClaudeLimits, type Db, type LimitWindow } from '@union/core';

import type { AgentOutcome } from './agent/agent';
import type { StepResult } from './scheduler';

/** The runners' result types, with the helpers that build them: one import for both. */
export type { StepContext, StepResult } from './scheduler';

const MS_PER_MINUTE = 60_000;
/** After the reset: the limit is lifted by then, and a clock a little off still lands after it. */
const RESET_MARGIN_MS = 2 * MS_PER_MINUTE;
/** When no reset time is known at all: soon enough to resume, rare enough not to spend a run on a limit. */
const UNKNOWN_RESET_MINUTES = 30;
const UNKNOWN_RESET_MS = UNKNOWN_RESET_MINUTES * MS_PER_MINUTE;

/** The step's result for an agent call stopped by the usage limit: retried after it resets, when known. */
export function rateLimited(outcome: Extract<AgentOutcome, { kind: 'rate_limited' }>): StepResult {
  return {
    kind: 'rate_limited',
    retryAt: outcome.resetsAt === null ? null : outcome.resetsAt + RESET_MARGIN_MS,
  };
}

/** The step's result for an agent call that did not finish: paused by the limit, or failed. */
export function notFinished(outcome: Exclude<AgentOutcome, { kind: 'ok' }>): StepResult {
  return outcome.kind === 'rate_limited'
    ? rateLimited(outcome)
    : { kind: 'error', error: outcome.message };
}

function full(window: LimitWindow | null, now: number): window is LimitWindow {
  return window !== null && window.utilization >= 1 && window.resetsAt > now;
}

/**
 * When the scheduler retries a step the limit paused: the time its result names, else the next reset
 * of a usage window the last report says is full, else in 30 minutes.
 */
export function retryTime(db: Db, retryAt: number | null, now = Date.now()): number {
  if (retryAt !== null) {
    return retryAt;
  }
  const limits = latestClaudeLimits(db);
  const resets = [limits?.fiveHour ?? null, limits?.sevenDay ?? null]
    .filter((window) => full(window, now))
    .map((window) => window.resetsAt);
  return resets.length > 0 ? Math.min(...resets) + RESET_MARGIN_MS : now + UNKNOWN_RESET_MS;
}
