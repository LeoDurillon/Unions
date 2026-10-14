import { eq, inArray } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';
import { emitEvent } from './tickets';

export type Preview = typeof schema.previews.$inferSelect;
export type PreviewStatus = Preview['status'];

/** A preview holding containers, or about to: what the running cap counts. */
const ACTIVE: PreviewStatus[] = ['starting', 'running', 'stopping'];

/** The ticket's compose project, its containers' prefix (`union-t12-web-1`). */
export function previewProject(ticketId: number): string {
  return `union-t${ticketId}`;
}

export function previewHost(ticketId: number): string {
  return `${ticketId}.localhost`;
}

export function getPreview(db: Db, ticketId: number): Preview | null {
  return (
    db.select().from(schema.previews).where(eq(schema.previews.ticketId, ticketId)).get() ?? null
  );
}

/** Records the preview's new state; every change is an event on the ticket, so its panel refreshes. */
export function updatePreview(
  db: Db,
  ticketId: number,
  values: Partial<Omit<Preview, 'ticketId' | 'updatedAt'>> & { status: PreviewStatus },
): Preview {
  const set = { ...values, updatedAt: Date.now() };
  const row = db
    .insert(schema.previews)
    .values({ ticketId, ...set })
    .onConflictDoUpdate({ target: schema.previews.ticketId, set })
    .returning()
    .get();
  emitEvent(db, {
    type: 'preview_changed',
    ticketId,
    payload: { status: row.status, url: row.url, error: row.error },
  });
  return row;
}

/** Changes other than the status (the compose file, the user's edit): the status stays as it is. */
function patchPreview(
  db: Db,
  ticketId: number,
  values: Partial<Omit<Preview, 'ticketId' | 'updatedAt' | 'status'>>,
): Preview {
  return updatePreview(db, ticketId, {
    status: getPreview(db, ticketId)?.status ?? 'stopped',
    ...values,
  });
}

/** The file Union generated (YAML), or why it could not. */
export function saveGeneratedCompose(
  db: Db,
  ticketId: number,
  result: { yaml: string } | { error: string },
): Preview {
  return patchPreview(db, ticketId, {
    composeYaml: 'yaml' in result ? result.yaml : null,
    composeError: 'error' in result ? result.error : null,
    composeAt: Date.now(),
  });
}

/** The user's own compose file for this ticket; null goes back to the generated one. */
export function setComposeOverride(db: Db, ticketId: number, yaml: string | null): Preview {
  return patchPreview(db, ticketId, {
    override: yaml,
    overrideAt: yaml === null ? null : Date.now(),
  });
}

export function activePreviews(db: Db): Preview[] {
  return db.select().from(schema.previews).where(inArray(schema.previews.status, ACTIVE)).all();
}

/**
 * What a stopped worker left half done: a start or a stop it was running failed. Running previews
 * are left as they are: their containers do not depend on the worker.
 */
export function recoverPreviews(db: Db): void {
  for (const row of activePreviews(db).filter((preview) => preview.status !== 'running')) {
    updatePreview(db, row.ticketId, {
      status: 'failed',
      error: `The worker stopped while the preview was ${row.status === 'starting' ? 'starting' : 'stopping'}: start or stop it again`,
    });
  }
}
