// Whether a pull request's description may be out of date: the branch was pushed after Union last wrote it.
import { and, eq, inArray, max } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

function lastAt(db: Db, ticketId: number, types: string[]): number | null {
  const row = db
    .select({ at: max(schema.events.at) })
    .from(schema.events)
    .where(and(eq(schema.events.ticketId, ticketId), inArray(schema.events.type, types)))
    .get();
  return row?.at ?? null;
}

/**
 * The branch was pushed again (a revision, a rebase) after Union last wrote the PR's description.
 * Unknown (a PR linked by hand) reads as not outdated.
 */
export function prDescriptionOutdated(db: Db, ticketId: number): boolean {
  const described = lastAt(db, ticketId, ['pull_request_opened', 'pr_description_sent']);
  const pushed = lastAt(db, ticketId, ['branch_pushed']);
  return described !== null && pushed !== null && pushed > described;
}
