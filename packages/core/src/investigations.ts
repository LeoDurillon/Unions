import { and, asc, desc, eq } from 'drizzle-orm';

import { validateTools } from './agent-tools';
import type { Db } from './db';
import * as schema from './schema';
import { isAgentModel } from './states';
import { emitEvent } from './tickets';

export { INVESTIGATION_DEFAULTS } from './investigation-defaults';

export type Investigation = typeof schema.investigations.$inferSelect;
export type InvestigationScope = (typeof schema.INVESTIGATION_SCOPES)[number];
export type InvestigationStatus = (typeof schema.INVESTIGATION_STATUSES)[number];

/** An investigation the request cannot create or change (bad input, or not in a state that allows it). */
export class InvestigationError extends Error {}

export function isInvestigationScope(value: unknown): value is InvestigationScope {
  return schema.INVESTIGATION_SCOPES.some((scope) => scope === value);
}

export type NewInvestigation = {
  projectId: number;
  title: string;
  prompt: string;
  scope: InvestigationScope;
  model: string;
  tools: readonly string[];
};

function requireText(value: string, label: string): string {
  const text = value.trim();
  if (text === '') {
    throw new InvestigationError(`The ${label} cannot be empty`);
  }
  return text;
}

export function getInvestigation(db: Db, id: number): Investigation {
  const row = db.select().from(schema.investigations).where(eq(schema.investigations.id, id)).get();
  if (!row) {
    throw new InvestigationError(`Investigation ${id} not found`);
  }
  return row;
}

/** Newest first. */
export function listInvestigations(db: Db, projectId: number): Investigation[] {
  return db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.projectId, projectId))
    .orderBy(desc(schema.investigations.id))
    .all();
}

/** Queues the investigation; the worker picks it up. */
export function createInvestigation(db: Db, input: NewInvestigation): Investigation {
  if (!isAgentModel(input.model)) {
    throw new InvestigationError(`Unknown model "${input.model}"`);
  }
  const values = {
    projectId: input.projectId,
    title: requireText(input.title, 'title'),
    prompt: requireText(input.prompt, 'prompt'),
    scope: input.scope,
    model: input.model,
    tools: validateTools(db, input.tools),
  };
  return db.transaction((tx) => {
    const row = tx.insert(schema.investigations).values(values).returning().get();
    emitEvent(tx, {
      type: 'investigation_queued',
      investigationId: row.id,
      payload: { title: row.title },
    });
    return row;
  });
}

/** Queues a finished investigation again, with the same prompt; the previous answer is dropped. */
export function rerunInvestigation(db: Db, id: number): Investigation {
  const current = getInvestigation(db, id);
  if (current.status === 'queued' || current.status === 'running') {
    throw new InvestigationError('The investigation has not finished yet');
  }
  return db.transaction((tx) => {
    const row = tx
      .update(schema.investigations)
      .set({ status: 'queued', result: null, error: null, startedAt: null, finishedAt: null })
      .where(eq(schema.investigations.id, id))
      .returning()
      .get();
    emitEvent(tx, { type: 'investigation_queued', investigationId: id, payload: { rerun: true } });
    return row;
  });
}

export function deleteInvestigation(db: Db, id: number): void {
  if (getInvestigation(db, id).status === 'running') {
    throw new InvestigationError('The agent is still running: cancel it first');
  }
  db.delete(schema.investigations).where(eq(schema.investigations.id, id)).run();
}

/** Marks the oldest queued investigation running and returns it; null when none waits. */
export function claimInvestigation(db: Db): Investigation | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.investigations)
      .where(eq(schema.investigations.status, 'queued'))
      .orderBy(asc(schema.investigations.id))
      .get();
    if (!next) {
      return null;
    }
    const row = tx
      .update(schema.investigations)
      .set({ status: 'running', startedAt: Date.now() })
      .where(eq(schema.investigations.id, next.id))
      .returning()
      .get();
    emitEvent(tx, { type: 'investigation_started', investigationId: row.id, payload: {} });
    return row;
  });
}

export type InvestigationOutcome =
  | { status: 'succeeded'; result: string }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

export function finishInvestigation(db: Db, id: number, outcome: InvestigationOutcome): void {
  db.transaction((tx) => {
    tx.update(schema.investigations)
      .set({
        status: outcome.status,
        result: outcome.status === 'succeeded' ? outcome.result : null,
        error: outcome.status === 'failed' ? outcome.error : null,
        finishedAt: Date.now(),
      })
      .where(eq(schema.investigations.id, id))
      .run();
    emitEvent(tx, {
      type: 'investigation_finished',
      investigationId: id,
      payload: { status: outcome.status },
    });
  });
}

/** Cancels a queued investigation; a running one is the worker's to stop. Returns whether it did. */
export function cancelQueuedInvestigation(db: Db, id: number): boolean {
  const queued = db
    .select()
    .from(schema.investigations)
    .where(and(eq(schema.investigations.id, id), eq(schema.investigations.status, 'queued')))
    .get();
  if (queued) {
    finishInvestigation(db, id, { status: 'cancelled' });
  }
  return queued !== undefined;
}

/** Runs left `running` by a worker that stopped mid-way fail; returns their ids. */
export function failInterruptedInvestigations(db: Db): number[] {
  const stuck = db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.status, 'running'))
    .all();
  for (const row of stuck) {
    finishInvestigation(db, row.id, {
      status: 'failed',
      error: 'The worker stopped during the run',
    });
  }
  return stuck.map((row) => row.id);
}
