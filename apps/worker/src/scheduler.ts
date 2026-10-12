import {
  modelFor,
  dispatch,
  emitEvent,
  getTicket,
  saveOutput,
  schema,
  type Db,
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
};

export type StepResult =
  | { kind: 'ok'; output: string; sessionId?: string }
  | { kind: 'rate_limited'; retryAt: number | null }
  | { kind: 'error'; error: string };

export type StepExecutor = (context: StepContext) => Promise<StepResult>;

type RunInfo = { ticketId: number; step: Step };

const RUN_STATUS = {
  ok: 'succeeded',
  error: 'failed',
  rate_limited: 'rate_limited',
} as const satisfies Record<StepResult['kind'], string>;

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
      emitEvent(this.db, { type: 'agent_event', ticketId, runId: run.id, payload: event });
    };
    const resumeSessionId = revision ? this.lastSessionId(ticketId, step) : null;
    const context: StepContext = {
      ticket,
      step,
      revision,
      resumeSessionId,
      log,
      signal: this.abort.signal,
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

  private finish(runId: number, ticketId: number, step: Step, result: StepResult): void {
    const status = RUN_STATUS[result.kind];
    this.db
      .update(schema.runs)
      .set({
        status,
        finishedAt: Date.now(),
        error: result.kind === 'error' ? result.error : null,
        sessionId: result.kind === 'ok' ? (result.sessionId ?? null) : null,
      })
      .where(eq(schema.runs.id, runId))
      .run();
    emitEvent(this.db, { type: 'run_finished', ticketId, runId, payload: { step, status } });

    if (result.kind === 'ok') {
      const saved = saveOutput(this.db, ticketId, step, result.output);
      const { phase } = getTicket(this.db, ticketId);
      // In a chain (fix requested at the final review) the next step runs right away, so this
      // output counts as accepted: the reviewer reads it as the approved implementation.
      if (phase.kind === 'running' && phase.thenRun) {
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
      dispatch(this.db, ticketId, { type: 'run_finished' });
    } else if (result.kind === 'rate_limited') {
      dispatch(this.db, ticketId, { type: 'rate_limited', retryAt: result.retryAt });
    } else {
      dispatch(this.db, ticketId, { type: 'run_failed', error: result.error });
    }
  }
}
