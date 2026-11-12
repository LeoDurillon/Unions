// The record of a project's shared services: written by the worker from Docker's state, read by the
// Environments tab. Also the commands the tab sends about them.

import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { sharedStacks, type SharedStackService } from '../schema/schema-shared-stacks';

export type SharedStack = typeof sharedStacks.$inferSelect;

/** What the worker saw: the services, who uses them and where the opened ones answer; `error` when a start failed. */
export type SharedStackSeen = {
  services: SharedStackService[];
  previews: string[];
  agents: number[];
  urls: { service: string; url: string }[];
  error: string | null;
};

/** Restarts the project's shared services (`{ projectId }`). */
export const SHARED_RESTART = 'shared_restart';
/** Takes them down, their data kept (`{ projectId }`); refused while a preview of the project runs. */
export const SHARED_STOP = 'shared_stop';

export function getSharedStack(db: Db, projectId: number): SharedStack | null {
  return db.select().from(sharedStacks).where(eq(sharedStacks.projectId, projectId)).get() ?? null;
}

function statusOf(seen: SharedStackSeen): SharedStack['status'] {
  if (seen.error !== null) {
    return 'failed';
  }
  return seen.services.some(({ running }) => running) ? 'running' : 'stopped';
}

/** Saves what the worker saw; the start time stays while they keep running. */
export function saveSharedStack(
  db: Db,
  projectId: number,
  seen: SharedStackSeen,
  at = Date.now(),
): SharedStack {
  const status = statusOf(seen);
  const before = getSharedStack(db, projectId);
  const kept = before?.status === 'running' ? before.startedAt : null;
  const startedAt = status === 'running' ? (kept ?? at) : null;
  const row = { projectId, status, ...seen, startedAt, updatedAt: at };
  db.insert(sharedStacks)
    .values(row)
    .onConflictDoUpdate({ target: sharedStacks.projectId, set: row })
    .run();
  return row;
}
