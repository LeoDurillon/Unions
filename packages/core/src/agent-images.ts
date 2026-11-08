// A project's own agent image in the database: saved by the web, then built, applied or failed by the worker.

import { and, eq } from 'drizzle-orm';

import type { AgentImageSource, AppliedAgentImage } from './agent-image-source';
import { outputTail } from './container-runs';
import type { Db } from './db';
import { commands } from './schema/schema';
import { agentImages } from './schema/schema-agent-images';

export type AgentImageRow = typeof agentImages.$inferSelect;

/** The command the worker brings a project's image in line with its row on. */
export const SYNC_AGENT_IMAGE = 'sync_agent_image';

export function readAgentImage(db: Db, projectId: number): AgentImageRow | null {
  return db.select().from(agentImages).where(eq(agentImages.projectId, projectId)).get() ?? null;
}

/** Asks the worker to build what is saved, stop a build no longer wanted, or drop a deleted project's images. */
export function queueAgentImageCommand(db: Db, projectId: number): void {
  db.insert(commands).values({ type: SYNC_AGENT_IMAGE, payload: { projectId } }).run();
}

/** Saves the user's choice as pending and queues its build; the applied one stays in use until it passes. */
export function saveAgentImage(db: Db, projectId: number, source: AgentImageSource): AgentImageRow {
  const fields = {
    pending: source,
    status: 'queued' as const,
    error: null,
    output: '',
    savedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  return db.transaction((tx) => {
    const row = tx
      .insert(agentImages)
      .values({ projectId, ...fields })
      .onConflictDoUpdate({ target: agentImages.projectId, set: fields })
      .returning()
      .get();
    queueAgentImageCommand(tx, projectId);
    return row;
  });
}

/** Drops what is saved and not applied (stopping its build); the applied image stays. */
export function discardPendingAgentImage(db: Db, projectId: number): AgentImageRow | null {
  return db.transaction((tx) => {
    const [row] = tx
      .update(agentImages)
      .set({ pending: null, status: 'idle', error: null, savedAt: Date.now() })
      .where(eq(agentImages.projectId, projectId))
      .returning()
      .all();
    if (!row) {
      return null;
    }
    queueAgentImageCommand(tx, projectId);
    return row;
  });
}

function sameSave(projectId: number, savedAt: number): ReturnType<typeof and> {
  return and(eq(agentImages.projectId, projectId), eq(agentImages.savedAt, savedAt));
}

/** The worker starts on the save made at `savedAt`; false when a newer save replaced it. */
export function markAgentImageBuilding(db: Db, projectId: number, savedAt: number): boolean {
  const rows = db
    .update(agentImages)
    .set({ status: 'building', startedAt: Date.now(), output: '' })
    .where(sameSave(projectId, savedAt))
    .returning({ projectId: agentImages.projectId })
    .all();
  return rows.length > 0;
}

export function writeAgentImageOutput(
  db: Db,
  projectId: number,
  savedAt: number,
  lines: readonly string[],
): void {
  db.update(agentImages)
    .set({ output: outputTail(lines) })
    .where(sameSave(projectId, savedAt))
    .run();
}

/** The build's end: applied (the save is no longer pending), or failed with the applied one kept. */
export function finishAgentImage(
  db: Db,
  target: { projectId: number; savedAt: number },
  result: { applied: AppliedAgentImage | null } | { error: string },
): void {
  const end = { finishedAt: Date.now() };
  const fields =
    'error' in result
      ? { ...end, status: 'failed' as const, error: result.error }
      : { ...end, status: 'idle' as const, error: null, pending: null, applied: result.applied };
  db.update(agentImages).set(fields).where(sameSave(target.projectId, target.savedAt)).run();
}

/** The tag of a Dockerfile rebuilt on a newer base image, so the page shows what runs. */
export function retagAppliedAgentImage(
  db: Db,
  projectId: number,
  applied: AppliedAgentImage,
): void {
  db.update(agentImages).set({ applied }).where(eq(agentImages.projectId, projectId)).run();
}

/** Saves the worker had not finished when it stopped: started again at its start. */
export function unfinishedAgentImages(db: Db): AgentImageRow[] {
  return db
    .select()
    .from(agentImages)
    .all()
    .filter((row) => row.status === 'queued' || row.status === 'building');
}
