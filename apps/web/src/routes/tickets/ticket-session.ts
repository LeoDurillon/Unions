// A ticket's agent sessions: what its agents used, its implementer session's size, and compacting it.

import {
  compactionRefusal,
  getSessionCompaction,
  getTicket,
  implementerSessionSize,
  latestSessionCompaction,
  queueSessionCompaction,
  schema,
  SessionCompactionError,
  type Db,
  type SessionCompaction,
  type Ticket,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, requireId } from '../../http';
import { ticketUsage } from '../usage';

/** The implementer's session as the panel shows it, its latest compaction, and why one cannot start. */
export type SessionCompactionView = {
  /** Null: no implementation ran yet. `context`: null right after a compaction, until the next call. */
  session: { context: number | null } | null;
  latest: Pick<
    SessionCompaction,
    'id' | 'status' | 'error' | 'contextBefore' | 'createdAt' | 'finishedAt'
  > | null;
  refusal: string | null;
};

function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

function view(db: Db, ticketId: number): SessionCompactionView {
  const size = implementerSessionSize(db, ticketId);
  const row = latestSessionCompaction(db, ticketId);
  return {
    session: size === null ? null : { context: size.context },
    latest:
      row === null
        ? null
        : {
            id: row.id,
            status: row.status,
            error: row.error,
            contextBefore: row.contextBefore,
            createdAt: row.createdAt,
            finishedAt: row.finishedAt,
          },
    refusal: compactionRefusal(db, ticketId),
  };
}

function compactionRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, loadTicket(db, c).id)));
  routes.post('/', (c) => {
    const ticket = loadTicket(db, c);
    try {
      queueSessionCompaction(db, ticket.id);
    } catch (error) {
      if (error instanceof SessionCompactionError) {
        throw fail(CONFLICT, error.message);
      }
      throw error;
    }
    return c.json(view(db, ticket.id), ACCEPTED);
  });
  routes.post('/:compactionId/cancel', (c) => {
    const ticket = loadTicket(db, c);
    const row = getSessionCompaction(db, requireId(c.req.param('compactionId'), 'compaction id'));
    if (row?.ticketId !== ticket.id) {
      throw fail(NOT_FOUND, 'Compaction not found');
    }
    if (row.status !== 'queued' && row.status !== 'running') {
      throw fail(CONFLICT, 'The session is not being compacted');
    }
    db.insert(schema.commands)
      .values({
        type: 'cancel_session_compaction',
        ticketId: ticket.id,
        payload: { compactionId: row.id },
      })
      .run();
    return c.json(view(db, ticket.id), ACCEPTED);
  });
  return routes;
}

/**
 * `/:id/usage`: what the ticket's agents used. `/:id/compaction`: its implementer session's size and
 * latest compaction; POST queues one (the worker runs `/compact` in it), `/:compactionId/cancel` stops it.
 */
export function ticketSessionRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:id/usage', (c) => ticketUsage(db, c));
  routes.route('/:id/compaction', compactionRoutes(db));
  return routes;
}
