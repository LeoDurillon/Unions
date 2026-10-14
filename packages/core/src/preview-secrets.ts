import { and, asc, eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

/** The names of the project's secret preview variables: all the browser ever sees of them. */
export function previewSecretNames(db: Db, projectId: number): string[] {
  return db
    .select({ name: schema.previewSecrets.name })
    .from(schema.previewSecrets)
    .where(eq(schema.previewSecrets.projectId, projectId))
    .orderBy(asc(schema.previewSecrets.name))
    .all()
    .map((row) => row.name);
}

/** The values, for the worker only. */
export function previewSecretValues(db: Db, projectId: number): Record<string, string> {
  return Object.fromEntries(
    db
      .select()
      .from(schema.previewSecrets)
      .where(eq(schema.previewSecrets.projectId, projectId))
      .all()
      .map((row) => [row.name, row.value]),
  );
}

export function setPreviewSecret(db: Db, projectId: number, name: string, value: string): void {
  db.insert(schema.previewSecrets)
    .values({ projectId, name, value })
    .onConflictDoUpdate({
      target: [schema.previewSecrets.projectId, schema.previewSecrets.name],
      set: { value, updatedAt: Date.now() },
    })
    .run();
}

export function deletePreviewSecret(db: Db, projectId: number, name: string): boolean {
  const removed = db
    .delete(schema.previewSecrets)
    .where(
      and(eq(schema.previewSecrets.projectId, projectId), eq(schema.previewSecrets.name, name)),
    )
    .returning()
    .all();
  return removed.length > 0;
}
