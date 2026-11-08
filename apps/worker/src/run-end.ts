// How a step's run ends once its result is in: as usual, cancelled by the user, or interrupted by the worker stopping.
import { emitEvent, schema, type Db, type Phase, type Step } from '@union/core';
import { eq } from 'drizzle-orm';

import type { StepResult } from './scheduler';

/** Why a run's signal was aborted. */
export const CANCELLED = 'cancelled';
export const SHUTDOWN = 'shutdown';

export const INTERRUPTED =
  'Interrupted: the worker stopped during the run (it runs the step again).';
export const CANCELLED_ERROR = 'Cancelled';

export type RunEnd = 'finished' | 'cancelled' | 'interrupted';

/**
 * A ticket that left `running` during the run (Cancel), or was removed (`phase` null), takes nothing from it. A run the worker's
 * stop aborted and that did not finish leaves the ticket `running`, so the next worker runs the step
 * again, as after a crash. Work that did finish is kept either way.
 */
export function runEnd(phase: Phase | null, signal: AbortSignal, result: StepResult): RunEnd {
  if (phase?.kind !== 'running') {
    return 'cancelled';
  }
  const done = result.kind === 'ok' || result.kind === 'commit_refused';
  return signal.aborted && signal.reason === SHUTDOWN && !done ? 'interrupted' : 'finished';
}

/** Records a run that ended without taking its result (cancelled, interrupted): the ticket's phase is left as it is. */
export function recordEndedRun(
  db: Db,
  run: { id: number; ticketId: number; step: Step },
  error: string,
): void {
  db.update(schema.runs)
    .set({ status: 'failed', finishedAt: Date.now(), error })
    .where(eq(schema.runs.id, run.id))
    .run();
  emitEvent(db, {
    type: 'run_finished',
    ticketId: run.ticketId,
    runId: run.id,
    payload: { step: run.step, status: 'failed' },
  });
}
