import { isRecord, schema, type Db, type PreviewConfig, type Project } from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { toPublicProject } from '../api-types';
import { BAD_REQUEST, fail, NOT_FOUND, readObject, requireId } from '../http';

const SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MAX_PORT = 65_535;

function loadProject(db: Db, c: Context): Project {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return project;
}

/** A path inside the repository: relative, and never climbing out of it. */
function composeFile(value: unknown): string {
  const file = typeof value === 'string' ? value.trim() : '';
  if (file === '' || file.startsWith('/') || file.split('/').includes('..')) {
    throw fail(BAD_REQUEST, 'Give the compose file as a path inside the repository');
  }
  return file;
}

function environment(value: unknown): Record<string, string> {
  const entries = Object.entries(isRecord(value) ? value : {});
  const wrong = entries.find(([key, item]) => !VARIABLE_NAME.test(key) || typeof item !== 'string');
  if (wrong) {
    throw fail(BAD_REQUEST, `"${wrong[0]}" is not a valid variable`);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, String(item)]));
}

/** The settings as sent, checked; null clears them. */
function previewConfig(body: Record<string, unknown>): PreviewConfig | undefined {
  if (body.preview === null) {
    return undefined;
  }
  const input = isRecord(body.preview) ? body.preview : {};
  const service = typeof input.service === 'string' ? input.service.trim() : '';
  if (!SERVICE_NAME.test(service)) {
    throw fail(BAD_REQUEST, 'Give the name of the service to serve, as in the compose file');
  }
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw fail(BAD_REQUEST, 'Give the port the service listens on');
  }
  return {
    composeFile: composeFile(input.composeFile),
    service,
    port,
    env: environment(input.env),
  };
}

/** `/api/projects/:projectId/preview`: how the project's tickets run as previews. */
export function previewSettingsRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.put('/:projectId/preview', async (c) => {
    const project = loadProject(db, c);
    const preview = previewConfig(await readObject(c.req.raw));
    const { preview: _old, ...config } = project.config;
    const updated = db
      .update(schema.projects)
      .set({ config: preview ? { ...config, preview } : config })
      .where(eq(schema.projects.id, project.id))
      .returning()
      .get();
    return c.json(toPublicProject(updated));
  });
  return routes;
}
