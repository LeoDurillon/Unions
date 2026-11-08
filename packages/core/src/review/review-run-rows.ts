// Whether a review side run's row still exists: one removed with its pull request stops its run.

import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';

const TABLES = {
  agent_review: schema.agentReviews,
  grouping: schema.reviewGroupings,
  report: schema.reviewReports,
  explanation: schema.reviewExplanations,
  review_agent_run: schema.reviewAgentRuns,
} as const;

export type ReviewRunKind = keyof typeof TABLES;

/** Whether the run's row is still there (removing a pull request from Union deletes its runs). */
export function reviewRunExists(db: Db, kind: ReviewRunKind, id: number): boolean {
  const table = TABLES[kind];
  return db.select({ id: table.id }).from(table).where(eq(table.id, id)).get() !== undefined;
}
