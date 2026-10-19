// The latest approved output of every step before `step`, in the order of the ticket's flow.
import {
  customAgentNames,
  FULL_FLOW,
  getTicket,
  isCustomStep,
  pipelineIndex,
  schema,
  STEPS,
  type Db,
  type Step,
} from '@union/core';
import { eq } from 'drizzle-orm';

/** An approved output; a custom step's carries its agent's name, for the prompt's heading. */
export type ApprovedOutput = { step: Step; content: string; name?: string };

/** The steps before `step`: the flow's, else (a step outside it) the built-in ones before it. */
function stepsBefore(flow: readonly Step[], step: Step): readonly Step[] {
  const at = flow.indexOf(step);
  return at === -1 ? STEPS.slice(0, Math.max(pipelineIndex(step), 0)) : flow.slice(0, at);
}

export function approvedBefore(db: Db, ticketId: number, step: Step): ApprovedOutput[] {
  const outputs = db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .all();
  const names = customAgentNames(db);
  return stepsBefore(getTicket(db, ticketId).flow ?? FULL_FLOW, step)
    .map((earlier) => outputs.findLast((o) => o.step === earlier && o.validation === 'approved'))
    .filter((output) => output !== undefined)
    .map((output): ApprovedOutput => {
      const name = isCustomStep(output.step) ? names[output.step] : undefined;
      return name === undefined
        ? { step: output.step, content: output.content }
        : { step: output.step, content: output.content, name };
    });
}
