// A project's connections to trackers (`integrations`): reading, saving and removing one, and its columns as read.
import { and, eq } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';
import type { IntegrationKindName } from './kinds';

export type Integration = typeof schema.integrations.$inferSelect;

export function integrationOf(
  db: Db,
  projectId: number,
  kind: IntegrationKindName,
): Integration | null {
  return (
    db
      .select()
      .from(schema.integrations)
      .where(and(eq(schema.integrations.projectId, projectId), eq(schema.integrations.kind, kind)))
      .get() ?? null
  );
}

/**
 * Connects a project to a tracker, or changes its secret and config. A new config forgets the columns
 * read for the old one: rules point at them by id, and another source has others.
 */
export function saveIntegration(
  db: Db,
  projectId: number,
  kind: IntegrationKindName,
  input: { secret: string; config: Record<string, unknown> },
): Integration {
  const current = integrationOf(db, projectId, kind);
  if (!current) {
    return db
      .insert(schema.integrations)
      .values({ projectId, kind, ...input })
      .returning()
      .get();
  }
  const sameConfig = JSON.stringify(current.config) === JSON.stringify(input.config);
  return db
    .update(schema.integrations)
    .set({ ...input, ...(sameConfig ? {} : { fields: null, fieldsReadAt: null, title: '' }) })
    .where(eq(schema.integrations.id, current.id))
    .returning()
    .get();
}

export function removeIntegration(db: Db, projectId: number, kind: IntegrationKindName): void {
  db.delete(schema.integrations)
    .where(and(eq(schema.integrations.projectId, projectId), eq(schema.integrations.kind, kind)))
    .run();
}

/** Keeps the tracker's columns as read now, and the source's title. */
export function storeFields(
  db: Db,
  integrationId: number,
  input: { fields: unknown; title: string },
): Integration {
  return db
    .update(schema.integrations)
    .set({ ...input, fieldsReadAt: Date.now() })
    .where(eq(schema.integrations.id, integrationId))
    .returning()
    .get();
}
