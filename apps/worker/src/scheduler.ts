import {
  appendAgentLine,
  type Db,
  dispatch,
  emitEvent,
  getTicket,
  type LeftoverResolution,
  modelFor,
  saveOutput,
  schema,
  type Step,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { revisionFor } from './revision';
import { RunSlots } from './slots';

export type StepContext = {
  ticket: Ticket;
  step: Step;
  /** Latest output of this step when the user asked for a revision. */
  revision: { previous: string; feedback: string } | null;
  /** Claude session of the last successful run of this step; set when resuming for a revision. */
  resumeSessionId: string | null;
  /** Appends a raw agent event to the live log of this run. */
  log: (event: unknown) => void;
  signal: AbortSignal;
  /** Set when the run finishes one paused on a refused commit: what to do with the changes. */
  resume: LeftoverResolution | null;
};

export type StepResult =
  | { kind: 'ok'; output: string; sessionId?: string }
  // The repository's hook refused the agent's leftover changes: the run pauses with its report.
  | { kind: 'commit_refused'; output: string; sessionId?: string }
  | { kind: 'rate_limited'; retryAt: number | null }
  | { kind: 'error'; error: string };

export type StepExecutor = (context: StepContext) => Promise<StepResult>;

type RunInfo = { ticketId: number; step: Step };

const RUN_STATUS = {
  ok: 'succeeded',
  // The agent finished: its session can be resumed if the user sends it back.
  commit_refused: 'succeeded',
  error: 'failed',
  rate_limited: 'rate_limited',
} as const satisfies Record<StepResult['kind'], string>;

const INTERRUPTED = 'Interrupted: the worker stopped during the run (it runs the step again).';

/** Runs one agent step per ticket in `running` phase, within the shared run slots. */
export class Scheduler {
  private readonly active = new Map<number, Promise<void>>();
  private readonly abort = new AbortController();
  /** Shared with the other agent runs (investigations). */
  readonly slots: RunSlots;

  constructor(
    private readonly db: Db,
    private readonly executor: StepExecutor,
    limit: number | RunSlots,
  ) {
    this.slots = typeof limit === 'number' ? new RunSlots(limit) : limit;
  }

  /**
   * Runs a stopped worker left `running` (a crash, a reload, a kill) are marked failed, and their
   * tickets' containers stopped: the agent the old process started may still be working there. The
   * tickets stay `running`, so the next tick runs their step again, alone.
   */
  async recover(stopContainer: (name: string) => Promise<void>): Promise<void> {
    const orphans = this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.status, 'running'))
      .all();
    for (const run of orphans) {
      this.db
        .update(schema.runs)
        .set({ status: 'failed', finishedAt: Date.now(), error: INTERRUPTED })
        .where(eq(schema.runs.id, run.id))
        .run();
      emitEvent(this.db, {
        type: 'run_finished',
        ticketId: run.ticketId,
        runId: run.id,
        payload: { step: run.step, status: 'failed' },
      });
    }
    for (const ticketId of new Set(orphans.map((run) => run.ticketId))) {
      const name = getTicket(this.db, ticketId).containerName;
      if (name) {
        // Stopping fails when the container is gone or already stopped: nothing to do then.
        await stopContainer(name).catch((error: unknown) => {
          emitEvent(this.db, {
            type: 'container_stop_failed',
            ticketId,
            payload: { error: String(error) },
          });
        });
      }
    }
  }

  tick(now = Date.now()): void {
    for (const ticket of this.db.select().from(schema.tickets).all()) {
      const { phase } = ticket;
      if (phase.kind === 'rate_limited' && phase.retryAt !== null && phase.retryAt <= now) {
        dispatch(this.db, ticket.id, { type: 'retry' });
      }
    }
    for (const ticket of this.db.select().from(schema.tickets).all()) {
      if (ticket.phase.kind === 'running' && !this.active.has(ticket.id)) {
        if (!this.slots.tryTake()) {
          return;
        }
        this.launch({ ticketId: ticket.id, step: ticket.phase.step });
      }
    }
  }

  /** Resolves when no run is in flight. */
  async idle(): Promise<void> {
    await Promise.all(this.active.values());
  }

  stop(): void {
    this.abort.abort();
  }

  private launch(info: RunInfo): void {
    const promise = this.runTracked(info);
    this.active.set(info.ticketId, promise);
  }

  private async runTracked(info: RunInfo): Promise<void> {
    try {
      await this.runStep(info);
    } finally {
      this.active.delete(info.ticketId);
      this.slots.release();
    }
  }

  private async runStep({ ticketId, step }: RunInfo): Promise<void> {
    const ticket = getTicket(this.db, ticketId);
    const revision = revisionFor(this.db, ticketId, step);
    const run = this.db
      .insert(schema.runs)
      .values({ ticketId, step, model: modelFor(this.db, step), status: 'running' })
      .returning()
      .get();
    emitEvent(this.db, { type: 'run_started', ticketId, runId: run.id, payload: { step } });

    const log = (event: unknown): void => {
      appendAgentLine(this.db, { ticketId, runId: run.id, payload: event });
    };
    const resumeSessionId = revision ? this.lastSessionId(ticketId, step) : null;
    const context: StepContext = {
      ticket,
      step,
      revision,
      resumeSessionId,
      log,
      signal: this.abort.signal,
      resume: ticket.phase.kind === 'running' ? (ticket.phase.resume ?? null) : null,
    };
    this.finish(run.id, ticketId, step, await this.execute(context));
  }

  private async execute(context: StepContext): Promise<StepResult> {
    try {
      return await this.executor(context);
    } catch (error) {
      return { kind: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private lastSessionId(ticketId: number, step: Step): string | null {
    const runs = this.db.select().from(schema.runs).where(eq(schema.runs.ticketId, ticketId)).all();
    const last = runs.findLast((run) => run.step === step && run.status === 'succeeded');
    return last?.sessionId ?? null;
  }

  /** Saves the output and the session; a chained step's output counts as accepted. */
  private saveResult(
    ticketId: number,
    step: Step,
    result: Extract<StepResult, { kind: 'ok' | 'commit_refused' }>,
  ): void {
    const saved = saveOutput(this.db, ticketId, step, result.output);
    const { phase } = getTicket(this.db, ticketId);
    // In a chain (fix requested at the final review) the next step runs right away, so this
    // output counts as accepted: the reviewer reads it as the approved implementation. A simplified
    // history waits on no one either.
    const accepted =
      phase.kind === 'running' && (phase.thenRun !== undefined || phase.step === 'simplify');
    if (result.kind === 'ok' && accepted) {
      this.db
        .update(schema.stepOutputs)
        .set({ validation: 'approved' })
        .where(eq(schema.stepOutputs.id, saved.id))
        .run();
    }
    if (result.sessionId) {
      this.db
        .update(schema.tickets)
        .set({ sessionId: result.sessionId })
        .where(eq(schema.tickets.id, ticketId))
        .run();
    }
  }

  private finish(runId: number, ticketId: number, step: Step, result: StepResult): void {
    const status = RUN_STATUS[result.kind];
    this.db
      .update(schema.runs)
      .set({
        status,
        finishedAt: Date.now(),
        error: result.kind === 'error' ? result.error : null,
        sessionId: 'sessionId' in result ? (result.sessionId ?? null) : null,
      })
      .where(eq(schema.runs.id, runId))
      .run();
    emitEvent(this.db, { type: 'run_finished', ticketId, runId, payload: { step, status } });

    if (result.kind === 'ok' || result.kind === 'commit_refused') {
      this.saveResult(ticketId, step, result);
      dispatch(this.db, ticketId, {
        type: result.kind === 'ok' ? 'run_finished' : 'commit_refused',
      });
    } else if (result.kind === 'rate_limited') {
      dispatch(this.db, ticketId, { type: 'rate_limited', retryAt: result.retryAt });
    } else {
      dispatch(this.db, ticketId, { type: 'run_failed', error: result.error });
    }
  }
}
