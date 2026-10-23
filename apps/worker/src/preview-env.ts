// The variables that point a command in the owner's container at its running preview.
import {
  exposedServices,
  getPreview,
  previewUrlVariables,
  schema,
  type Db,
  type PreviewConfig,
  type WorkspaceOwner,
} from '@union/core';
import { eq } from 'drizzle-orm';

/** The address of the first exposed service from inside the environment: `http://web:3000`. */
export function baseUrl(preview: PreviewConfig): string | null {
  const [first] = exposedServices(preview);
  return first ? `http://${first.name}:${first.port}` : null;
}

/**
 * While the owner's preview runs: `BASE_URL` (and `PREVIEW_URL`), the first service by name, and
 * `UNION_URL_<SERVICE>`, each service's public address (the container answers at it too). Empty
 * when it does not run.
 */
export function previewEnv(db: Db, owner: WorkspaceOwner): Record<string, string> {
  const row = getPreview(db, owner);
  if (row?.status !== 'running') {
    return {};
  }
  const preview = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, row.projectId))
    .get()?.config.preview;
  const url = preview ? baseUrl(preview) : null;
  return {
    ...(url ? { BASE_URL: url, PREVIEW_URL: url } : {}),
    ...previewUrlVariables(row.urls ?? []),
  };
}
