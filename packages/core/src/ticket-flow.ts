// Choosing the steps a ticket runs: only before it starts, since the start fixes them.
import { eq } from 'drizzle-orm';

import { flowReadySteps } from './custom-agents';
import type { Db } from './db';
import { flowProblems } from './flows';
import * as schema from './schema';
import type { PipelineStep } from './states';
import { emitEvent, getTicket, type Ticket } from './tickets';

/** The flow cannot be chosen: the ticket started, or the steps are no flow. */
export class FlowChangeRefused extends Error {}

/** Sets the ticket's flow; null goes back to the project's default. */
export function chooseFlow(db: Db, ticketId: number, flow: PipelineStep[] | null): Ticket {
  const problems = flow === null ? [] : flowProblems(flow, flowReadySteps(db));
  if (problems.length > 0) {
    throw new FlowChangeRefused(problems.join('; '));
  }
  return db.transaction((tx) => {
    if (getTicket(tx, ticketId).phase.kind !== 'backlog') {
      throw new FlowChangeRefused('The flow can only change before the ticket starts');
    }
    const updated = tx
      .update(schema.tickets)
      .set({ flow })
      .where(eq(schema.tickets.id, ticketId))
      .returning()
      .get();
    emitEvent(tx, { type: 'ticket_flow_chosen', ticketId, payload: { flow } });
    return updated;
  });
}
