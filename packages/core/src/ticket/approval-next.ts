// What approving a ticket's step starts: the next step and the model it runs on, as the worker will run it.

import { modelFor } from '../agent/agents';
import type { Db } from '../db';
import { FULL_FLOW, transition, type AgentModel, type Step } from '../states';
import type { Ticket } from './tickets';

export type AfterApproval = { step: Step; model: AgentModel };

/**
 * The step approving would start, and its model, or null when approving starts nothing (the last
 * step, a ticket not waiting). The same transition `dispatch` applies, and the same `modelFor` the
 * scheduler records the run with.
 */
export function afterApproval(
  db: Db,
  ticket: Pick<Ticket, 'phase' | 'flow'>,
): AfterApproval | null {
  if (ticket.phase.kind !== 'awaiting_approval') {
    return null;
  }
  try {
    const next = transition(ticket.phase, { type: 'approve' }, ticket.flow ?? FULL_FLOW);
    return next.kind === 'running' ? { step: next.step, model: modelFor(db, next.step) } : null;
  } catch {
    return null;
  }
}
