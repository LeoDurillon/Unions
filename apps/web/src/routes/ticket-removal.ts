// Removes a cancelled ticket from Union: its runs, outputs, reviews and files go with it, and the
// worker is asked to remove its container (the web never calls Docker).
import { emitEvent, schema, type Db } from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';

import { CONFLICT, fail, NOT_FOUND, requireId } from '../http';
import { removeTicketFiles } from './attachments';

const NO_CONTENT = 204;

/**
 * Removes a cancelled ticket from Union: its runs, outputs, reviews and files go with it, and the
 * worker is asked to remove its container (the web never calls Docker). The GitHub issue and the
 * Notion page it came from are left as they are.
 */
export async function removeCancelledTicket(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, id)).get();
  if (!ticket) {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
  if (ticket.phase.kind !== 'cancelled') {
    throw fail(CONFLICT, 'Only a cancelled ticket can be removed: cancel it first');
  }
  const running = db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.ticketId, id), eq(schema.runs.status, 'running')))
    .get();
  if (running) {
    throw fail(CONFLICT, 'The agent is still stopping: try again in a moment');
  }
  const { containerName, homeVolume, workspaceVolume } = ticket;
  db.transaction((tx) => {
    tx.delete(schema.commands)
      .where(and(eq(schema.commands.ticketId, id), isNull(schema.commands.handledAt)))
      .run();
    if (containerName && homeVolume && workspaceVolume) {
      tx.insert(schema.commands)
        .values({
          type: 'remove_containers',
          payload: {
            containers: [{ name: containerName, home: homeVolume, workspace: workspaceVolume }],
          },
        })
        .run();
    }
    tx.delete(schema.tickets).where(eq(schema.tickets.id, id)).run();
    // Not on the ticket: it is gone, and its panel would refetch it.
    emitEvent(tx, { type: 'ticket_removed', payload: { ticketId: id, title: ticket.title } });
  });
  await removeTicketFiles([id]);
  return c.body(null, NO_CONTENT);
}
