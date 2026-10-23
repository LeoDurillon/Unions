// The feedback a run of `step` must address, if the user asked for changes.
import { latestOutput, type Db, type Step } from '@union/core';

export type Revision = { previous: string; feedback: string };

/**
 * The feedback a run of `step` must address, if the user asked for changes. Feedback on the final
 * review is addressed by the implementer, so for `implement` the newer of its own output and the
 * review's output decides.
 */
export function revisionFor(db: Db, ticketId: number, step: Step): Revision | null {
  const own = latestOutput(db, ticketId, step);
  const review = step === 'implement' ? latestOutput(db, ticketId, 'final_review') : undefined;
  const newest = review && (!own || review.id > own.id) ? review : own;
  if (newest?.validation !== 'revise' || !newest.feedback) {
    return null;
  }
  return { previous: own?.content ?? '', feedback: newest.feedback };
}
