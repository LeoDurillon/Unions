import { pipelineIndex, schema, STEPS, type Db, type Step } from '@union/core';
import { eq } from 'drizzle-orm';

/** The latest approved output of every step before `step`, in pipeline order. */
export function approvedBefore(
  db: Db,
  ticketId: number,
  step: Step,
): { step: Step; content: string }[] {
  const outputs = db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .all();
  return STEPS.slice(0, pipelineIndex(step))
    .map((earlier) => outputs.findLast((o) => o.step === earlier && o.validation === 'approved'))
    .filter((output) => output !== undefined)
    .map((output) => ({ step: output.step, content: output.content }));
}
