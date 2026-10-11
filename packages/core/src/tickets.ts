import { desc, eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './schema';
import { boardStatus, transition, type Action, type Phase, type Step } from './states';

export type Ticket = typeof schema.tickets.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;
export type ProjectConfig = schema.ProjectConfig;
export type Run = typeof schema.runs.$inferSelect;
export type DiffSnapshot = typeof schema.diffSnapshots.$inferSelect;
export type DiffFileRow = typeof schema.diffFiles.$inferSelect;
export type ReviewComment = typeof schema.reviewComments.$inferSelect;
export type StepOutput = typeof schema.stepOutputs.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export type NewEvent = {
  type: string;
  ticketId?: number;
  runId?: number;
  payload: unknown;
};

export function emitEvent(db: Executor, event: NewEvent): void {
  db.insert(schema.events)
    .values({
      type: event.type,
      ticketId: event.ticketId ?? null,
      runId: event.runId ?? null,
      payload: event.payload,
    })
    .run();
}

export function getTicket(db: Executor, id: number): Ticket {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, id)).get();
  if (!ticket) {
    throw new Error(`Ticket ${id} not found`);
  }
  return ticket;
}

export function createTicket(
  db: Db,
  input: { projectId: number; title: string; body?: string },
): Ticket {
  return db.transaction((tx) => {
    const ticket = tx
      .insert(schema.tickets)
      .values({ projectId: input.projectId, title: input.title, body: input.body ?? '' })
      .returning()
      .get();
    emitEvent(tx, {
      type: 'ticket_created',
      ticketId: ticket.id,
      payload: { title: ticket.title },
    });
    return ticket;
  });
}

/** Applies a state-machine action, persists the new phase, and emits `phase_changed`. */
export function dispatch(db: Db, ticketId: number, action: Action): Phase {
  return db.transaction((tx) => {
    const ticket = getTicket(tx, ticketId);
    const next = transition(ticket.phase, action);
    tx.update(schema.tickets).set({ phase: next }).where(eq(schema.tickets.id, ticketId)).run();
    emitEvent(tx, {
      type: 'phase_changed',
      ticketId,
      payload: { from: ticket.phase, to: next, action: action.type, board: boardStatus(next) },
    });
    return next;
  });
}

export function latestOutput(db: Executor, ticketId: number, step: Step): StepOutput | undefined {
  return db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .orderBy(desc(schema.stepOutputs.version))
    .all()
    .find((row) => row.step === step);
}

export function saveOutput(db: Db, ticketId: number, step: Step, content: string): StepOutput {
  return db.transaction((tx) => {
    const previous = latestOutput(tx, ticketId, step);
    const row = tx
      .insert(schema.stepOutputs)
      .values({ ticketId, step, content, version: (previous?.version ?? 0) + 1 })
      .returning()
      .get();
    emitEvent(tx, {
      type: 'step_output',
      ticketId,
      payload: { step, version: row.version },
    });
    return row;
  });
}

/** Records the user's verdict on the latest output of the step the ticket is waiting on. */
export function recordValidation(
  db: Db,
  ticketId: number,
  verdict: { status: 'approved' | 'revise'; feedback?: string },
): void {
  db.transaction((tx) => {
    const { phase, projectId } = getTicket(tx, ticketId);
    if (phase.kind !== 'awaiting_approval') {
      throw new Error(`Ticket ${ticketId} is not awaiting approval`);
    }
    const output = latestOutput(tx, ticketId, phase.step);
    if (output) {
      tx.update(schema.stepOutputs)
        .set({ validation: verdict.status, feedback: verdict.feedback ?? null })
        .where(eq(schema.stepOutputs.id, output.id))
        .run();
    }
    if (verdict.status === 'revise' && verdict.feedback) {
      tx.insert(schema.feedbackEvents)
        .values({ projectId, ticketId, section: phase.step, text: verdict.feedback })
        .run();
    }
  });
}
