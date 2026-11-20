// The ticket's implementer session (the one the code steps resume), and how large its context is now.

import { and, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';

import type { Step } from '../phases';
import * as schema from '../tables';
import type { emitEvent } from './tickets';

/** The database, or a transaction on it. */
type Executor = Parameters<typeof emitEvent>[0];

/** The steps that run in the implementer's session, each continuing the last one's. */
const IMPLEMENTER_STEPS: Step[] = [
  'implement',
  'rebase',
  'retarget',
  'simplify',
  'split',
  'restack',
];

/**
 * The implementer's session (or the last run that continued it), resumed for the task. A clean
 * rebase ran no agent and saved no session: it is skipped.
 */
export function implementerSession(db: Executor, ticketId: number): string | null {
  const run = db
    .select({ sessionId: schema.runs.sessionId })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.ticketId, ticketId),
        eq(schema.runs.status, 'succeeded'),
        isNotNull(schema.runs.sessionId),
        inArray(schema.runs.step, IMPLEMENTER_STEPS),
      ),
    )
    .orderBy(desc(schema.runs.id))
    .get();
  return run?.sessionId ?? null;
}

/**
 * The context of the session's last call made after `since` (ms), in tokens: the size the next
 * resume starts from. Null when no call since says so (none, or only the compaction itself).
 */
export function sessionContext(db: Executor, sessionId: string, since = 0): number | null {
  const row = db
    .select({ peak: schema.agentUsage.peakContext })
    .from(schema.agentUsage)
    .where(
      and(
        eq(schema.agentUsage.sessionId, sessionId),
        eq(schema.agentUsage.main, true),
        gt(schema.agentUsage.at, since),
      ),
    )
    .orderBy(desc(schema.agentUsage.id))
    .get();
  return row?.peak ?? null;
}
