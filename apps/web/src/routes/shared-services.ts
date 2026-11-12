// `/api/projects/:projectId/shared-services`: the project's shared services as the worker last saw
// them, who uses them. Also restarting or stopping them (the worker does: the web never touches
// Docker).
import {
  activePreviews,
  getSharedStack,
  schema,
  SHARED_RESTART,
  SHARED_STOP,
  type Db,
  type SharedStack,
} from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail, requireId } from '../http';
import type { SharedServicesUser, SharedServicesView } from '../shared-services-types';

const OWNER_KEY = /^(?<kind>[tr])(?<id>\d+)$/u;

function ticketTitle(db: Db, ticketId: number): string {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  return ticket?.title ?? `Ticket ${ticketId}`;
}

function userOf(db: Db, key: string): SharedServicesUser | null {
  const groups = OWNER_KEY.exec(key)?.groups;
  if (groups?.id === undefined) {
    return null;
  }
  const id = Number(groups.id);
  if (groups.kind === 't') {
    return { kind: 'ticket', ticketId: id, title: ticketTitle(db, id) };
  }
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, id))
    .get();
  return review
    ? { kind: 'pull-request', reviewId: id, number: review.prNumber, title: review.title }
    : null;
}

function pendingOf(db: Db, projectId: number): SharedServicesView['pending'] {
  const first = db
    .select()
    .from(schema.commands)
    .where(and(isNull(schema.commands.handledAt), isNull(schema.commands.ticketId)))
    .all()
    .find(
      (row) =>
        (row.type === SHARED_RESTART || row.type === SHARED_STOP) &&
        typeof row.payload === 'object' &&
        row.payload !== null &&
        'projectId' in row.payload &&
        row.payload.projectId === projectId,
    );
  if (first === undefined) {
    return null;
  }
  return first.type === SHARED_RESTART ? 'restart' : 'stop';
}

function refusalsOf(
  db: Db,
  projectId: number,
  stack: SharedStack | null,
  pending: SharedServicesView['pending'],
): SharedServicesView['refusals'] {
  if (pending !== null) {
    const busy = 'The worker is on it already.';
    return { restart: busy, stop: busy };
  }
  const running = stack?.status === 'running';
  const inUse = activePreviews(db).some((preview) => preview.projectId === projectId);
  return {
    restart: running ? null : 'They are not running.',
    stop: inUse ? 'A preview of the project uses them: stop it first.' : null,
  };
}

function view(db: Db, projectId: number): SharedServicesView {
  const stack = getSharedStack(db, projectId);
  const pending = pendingOf(db, projectId);
  return {
    stack: stack
      ? {
          status: stack.status,
          services: stack.services,
          urls: stack.urls,
          error: stack.error,
          startedAt: stack.startedAt,
          updatedAt: stack.updatedAt,
        }
      : null,
    previews: (stack?.previews ?? []).flatMap((key) => userOf(db, key) ?? []),
    agents: (stack?.agents ?? []).map((ticketId) => ({
      ticketId,
      title: ticketTitle(db, ticketId),
    })),
    pending,
    refusals: refusalsOf(db, projectId, stack, pending),
  };
}

function ask(db: Db, c: Context, action: 'restart' | 'stop'): Response {
  const projectId = requireId(c.req.param('projectId'), 'project id');
  const refusal = view(db, projectId).refusals[action];
  if (refusal !== null) {
    throw fail(CONFLICT, refusal);
  }
  db.insert(schema.commands)
    .values({ type: action === 'restart' ? SHARED_RESTART : SHARED_STOP, payload: { projectId } })
    .run();
  return c.json(view(db, projectId), ACCEPTED);
}

/** Under `/api/projects`: the shared services' state, and restarting or stopping them. */
export function sharedServicesRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/shared-services', (c) =>
    c.json(view(db, requireId(c.req.param('projectId'), 'project id'))),
  );
  routes.post('/:projectId/shared-services/restart', (c) => ask(db, c, 'restart'));
  routes.post('/:projectId/shared-services/stop', (c) => ask(db, c, 'stop'));
  return routes;
}
