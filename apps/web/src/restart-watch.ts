// Ends the web's container when an update asks Union to restart (`union_restart`); compose starts it again on the new commit.
import { schema, type Db } from '@union/core';
import { and, desc, eq, gt } from 'drizzle-orm';

const POLL_MS = 1000;
/** Compose runs the container with `init: true`: stopping PID 1 stops the API and Vite with it. */
const INIT_PID = 1;

declare global {
  // One watcher per process, across hot reloads.
  var __unionRestartWatch: Timer | undefined;
}

function lastSeq(db: Db): number {
  const row = db
    .select({ seq: schema.events.seq })
    .from(schema.events)
    .orderBy(desc(schema.events.seq))
    .limit(1)
    .get();
  return row?.seq ?? 0;
}

/** Only under compose (`UNION_SUPERVISED`): elsewhere nothing would start the web again. */
export function watchForRestart(db: Db): void {
  if (process.env.UNION_SUPERVISED !== '1' || globalThis.__unionRestartWatch) {
    return;
  }
  const since = lastSeq(db);
  globalThis.__unionRestartWatch = setInterval(() => {
    const restart = db
      .select({ seq: schema.events.seq })
      .from(schema.events)
      .where(and(eq(schema.events.type, 'union_restart'), gt(schema.events.seq, since)))
      .get();
    if (restart) {
      process.kill(INIT_PID, 'SIGTERM');
    }
  }, POLL_MS);
}
