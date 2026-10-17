// Tickets: reading, creating and labelling them, the event log they write to, and dispatching state-machine actions.
import { desc, eq } from 'drizzle-orm';

import type { Db } from './db';
import type { NewEvent } from './event-catalog';
import { resolveFlow } from './flows';
import * as schema from './schema';
import type { reviewComments } from './schema-reviews';
import {
  boardStatus,
  FULL_FLOW,
  transition,
  type Action,
  type Flow,
  type Phase,
  type PipelineStep,
  type Step,
} from './states';

export type Ticket = typeof schema.tickets.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;
export type ProjectConfig = schema.ProjectConfig;
export type Run = typeof schema.runs.$inferSelect;
export type DiffSnapshot = typeof schema.diffSnapshots.$inferSelect;
export type DiffFileRow = typeof schema.diffFiles.$inferSelect;
export type ReviewComment = typeof reviewComments.$inferSelect;
export type StepOutput = typeof schema.stepOutputs.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export function emitEvent(db: Executor, event: NewEvent): void {
  db.insert(schema.events)
    .values({
      type: event.type,
      ticketId: event.ticketId ?? null,
      runId: event.runId ?? null,
      investigationId: event.investigationId ?? null,
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

/**
 * A new backlog ticket. With `issue` it starts from an existing GitHub issue: the sync then adds
 * that issue to the project board instead of creating one.
 */
export function createTicket(
  db: Db,
  input: {
    projectId: number;
    title: string;
    body?: string;
    issue?: { number: number; nodeId: string };
    /** The Notion page it was imported from. */
    notionPageId?: string;
    /** The steps it runs, checked by the caller; absent: the project's default at start. */
    flow?: PipelineStep[] | null;
  },
): Ticket {
  return db.transaction((tx) => {
    const ticket = tx
      .insert(schema.tickets)
      .values({
        projectId: input.projectId,
        title: input.title,
        body: input.body ?? '',
        issueNumber: input.issue?.number ?? null,
        issueNodeId: input.issue?.nodeId ?? null,
        notionPageId: input.notionPageId ?? null,
        flow: input.flow ?? null,
      })
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

/** `#<issue>` once the ticket is on GitHub, else its local id. */
export function ticketLabel(ticket: Pick<Ticket, 'id' | 'issueNumber'>): string {
  return ticket.issueNumber === null ? `ticket ${ticket.id}` : `#${ticket.issueNumber}`;
}

/** A ticket may not start before the ticket it builds on is done. */
export class StartBlocked extends Error {
  constructor(readonly parent: Ticket) {
    super(`Blocked by ${ticketLabel(parent)} (${parent.title}) until it is done`);
  }
}

/** The parent that keeps the ticket from starting, or null when it may start. */
export function blockingParent(db: Executor, ticket: Ticket): Ticket | null {
  if (ticket.parentTicketId === null) {
    return null;
  }
  const parent = getTicket(db, ticket.parentTicketId);
  return parent.phase.kind === 'done' ? null : parent;
}

/** The flow the action follows: on start, the one the ticket keeps from then on. */
function flowFor(db: Executor, ticket: Ticket, action: Action): Flow {
  if (action.type !== 'start') {
    return ticket.flow ?? FULL_FLOW;
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  return project ? resolveFlow(ticket, project.config) : (ticket.flow ?? FULL_FLOW);
}

/**
 * Applies a state-machine action, persists the new phase, and emits `phase_changed`. Starting also
 * fixes the ticket's flow, so a preset edited later leaves it as it was.
 */
export function dispatch(db: Db, ticketId: number, action: Action): Phase {
  return db.transaction((tx) => {
    const ticket = getTicket(tx, ticketId);
    const parent = action.type === 'start' ? blockingParent(tx, ticket) : null;
    if (parent) {
      throw new StartBlocked(parent);
    }
    const flow = flowFor(tx, ticket, action);
    const next = transition(ticket.phase, action, flow);
    const started = action.type === 'start' ? { flow: [...flow] } : {};
    tx.update(schema.tickets)
      .set({ phase: next, ...started })
      .where(eq(schema.tickets.id, ticketId))
      .run();
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

/** The step whose latest output a verdict goes on: a done ticket's goes on its final review. */
function validatedSection(phase: Phase): Step {
  return 'step' in phase ? phase.step : 'final_review';
}

/** Records the user's verdict on the latest output of the step the ticket is waiting on. */
export function recordValidation(
  db: Db,
  ticketId: number,
  verdict: { status: 'approved' | 'revise'; feedback?: string },
): void {
  db.transaction((tx) => {
    const { phase, projectId } = getTicket(tx, ticketId);
    // A done ticket can still be sent back with a review: the feedback goes on its final review,
    // where the implementer looks for it (`revisionFor`).
    const sentBack = phase.kind === 'done' && verdict.status === 'revise';
    // The implementer paused on a refused commit can be sent back with guidance on its report.
    const refused =
      phase.kind === 'commit_refused' && phase.step === 'implement' && verdict.status === 'revise';
    if (phase.kind !== 'awaiting_approval' && !sentBack && !refused) {
      throw new Error(`Ticket ${ticketId} is not awaiting approval`);
    }
    const section = validatedSection(phase);
    const output = latestOutput(tx, ticketId, section);
    if (output) {
      tx.update(schema.stepOutputs)
        .set({ validation: verdict.status, feedback: verdict.feedback ?? null })
        .where(eq(schema.stepOutputs.id, output.id))
        .run();
    }
    if (verdict.status === 'revise' && verdict.feedback) {
      tx.insert(schema.feedbackEvents)
        .values({ projectId, ticketId, section, text: verdict.feedback })
        .run();
    }
  });
}
