// A ticket as the API answers with it: its summary, and the detail the ticket panel opens with.
import { describeTicketBase, getTicket, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { TicketDetail, TicketSummary } from '../api-types';
import { fail, NOT_FOUND, requireId } from '../http';
import { publicProjectOf } from '../public-project';
import { childrenOf, findTicket, summarizeWithStack } from './ticket-links';

export function loadTicket(db: Db, id: number): TicketSummary {
  try {
    return summarizeWithStack(db, getTicket(db, id), findTicket(db));
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

export function ticketDetail(db: Db, c: Context): Response {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = loadTicket(db, id);
  const project = db
    .select()
    .from(schema.projects)
    .all()
    .find((row) => row.id === ticket.projectId);
  if (!project) {
    throw fail(NOT_FOUND, 'Project not found');
  }
  const parent = ticket.parentTicketId === null ? null : findTicket(db)(ticket.parentTicketId);
  const detail: TicketDetail = {
    ticket,
    project: publicProjectOf(db, project),
    children: childrenOf(db, id),
    base: describeTicketBase(ticket, parent ?? null, project.config.baseBranch),
    outputs: db
      .select()
      .from(schema.stepOutputs)
      .where(eq(schema.stepOutputs.ticketId, id))
      .orderBy(schema.stepOutputs.version)
      .all(),
    runs: db.select().from(schema.runs).where(eq(schema.runs.ticketId, id)).all(),
  };
  return c.json(detail);
}
