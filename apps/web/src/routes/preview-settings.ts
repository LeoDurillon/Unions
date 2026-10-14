import {
  deletePreviewSecret,
  isRecord,
  previewSecretNames,
  schema,
  setPreviewSecret,
  templateProblems,
  type Db,
  type PreviewConfig,
  type PreviewService,
  type Project,
} from '@union/core';
import { desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { toPublicProject, type PreviewSettingsView } from '../api-types';
import { BAD_REQUEST, fail, NOT_FOUND, readObject, requireId } from '../http';

const SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** A host name label: `api` in `api.12.localhost`. */
const PREFIX = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/u;
const MAX_PORT = 65_535;
const MAX_SECRET_CHARS = 10_000;

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

function service(value: unknown): PreviewService {
  const input = isRecord(value) ? value : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!SERVICE_NAME.test(name)) {
    throw fail(BAD_REQUEST, 'Give each exposed service its name in the compose file');
  }
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw fail(BAD_REQUEST, `Give the port "${name}" listens on`);
  }
  const prefix = typeof input.prefix === 'string' ? input.prefix.trim().toLowerCase() : '';
  if (!PREFIX.test(prefix)) {
    throw fail(BAD_REQUEST, `"${prefix}" cannot start a host name: letters, digits and dashes`);
  }
  return { name, port, prefix };
}

function services(value: unknown): PreviewService[] {
  const list = (Array.isArray(value) ? value : []).map((item: unknown) => service(item));
  if (list.length === 0) {
    throw fail(BAD_REQUEST, 'Expose at least one service');
  }
  const names = new Set(list.map((item) => item.name));
  const prefixes = new Set(list.map((item) => item.prefix));
  if (names.size < list.length || prefixes.size < list.length) {
    throw fail(BAD_REQUEST, 'Each exposed service needs its own name and its own host');
  }
  return list;
}

function environment(
  value: unknown,
  exposed: PreviewService[],
  secrets: string[],
): Record<string, string> {
  const entries = Object.entries(isRecord(value) ? value : {});
  for (const [key, item] of entries) {
    if (!VARIABLE_NAME.test(key) || typeof item !== 'string') {
      throw fail(BAD_REQUEST, `"${key}" is not a valid variable`);
    }
    if (secrets.includes(key)) {
      throw fail(BAD_REQUEST, `"${key}" is a secret already: remove one of them`);
    }
    const problems = templateProblems(item, exposed);
    if (problems.length > 0) {
      throw fail(BAD_REQUEST, `${key}: ${problems.join('; ')}`);
    }
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, String(item)]));
}

function envFile(value: unknown): PreviewConfig['envFile'] {
  if (!isRecord(value)) {
    return undefined;
  }
  const serviceName = typeof value.service === 'string' ? value.service.trim() : '';
  const path = typeof value.path === 'string' ? value.path.trim() : '';
  if (!SERVICE_NAME.test(serviceName) || !path.startsWith('/')) {
    throw fail(BAD_REQUEST, 'Give the env file a service and an absolute path inside it');
  }
  return { service: serviceName, path };
}

/** The settings as sent, checked; null clears them. */
function previewConfig(
  body: Record<string, unknown>,
  secrets: string[],
): PreviewConfig | undefined {
  if (body.preview === null) {
    return undefined;
  }
  const input = isRecord(body.preview) ? body.preview : {};
  const exposed = services(input.services);
  const file = envFile(input.envFile);
  return {
    composeFile: composeFile(input.composeFile),
    services: exposed,
    env: environment(input.env, exposed, secrets),
    ...(file ? { envFile: file } : {}),
  };
}

/** The services of the latest compose file generated for one of the project's tickets. */
function composeServices(db: Db, projectId: number): PreviewSettingsView['composeServices'] {
  const row = db
    .select({
      ticketId: schema.previews.ticketId,
      yaml: schema.previews.composeYaml,
      at: schema.previews.composeAt,
    })
    .from(schema.previews)
    .innerJoin(schema.tickets, eq(schema.tickets.id, schema.previews.ticketId))
    .where(eq(schema.tickets.projectId, projectId))
    .orderBy(desc(schema.previews.composeAt))
    .all()
    .find((candidate) => candidate.yaml !== null);
  if (!row?.yaml || row.at === null) {
    return null;
  }
  const parsed: unknown = Bun.YAML.parse(row.yaml);
  const found = isRecord(parsed) && isRecord(parsed.services) ? Object.keys(parsed.services) : [];
  return { names: found, ticketId: row.ticketId, at: row.at };
}

function settingsView(db: Db, project: Project): PreviewSettingsView {
  return {
    secretNames: previewSecretNames(db, project.id),
    composeServices: composeServices(db, project.id),
  };
}

function secretName(c: Context, project: Project): string {
  const name = c.req.param('name') ?? '';
  if (!VARIABLE_NAME.test(name)) {
    throw fail(BAD_REQUEST, `"${name}" is not a valid variable name`);
  }
  if (Object.hasOwn(project.config.preview?.env ?? {}, name)) {
    throw fail(BAD_REQUEST, `"${name}" is a plain variable already: remove it first`);
  }
  return name;
}

/**
 * `/api/projects/:projectId/preview`: how the project's tickets run as previews, and its secret
 * variables, whose values are written here and never read back.
 */
export function previewSettingsRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/preview', (c) => c.json(settingsView(db, loadProject(db, c))));
  routes.put('/:projectId/preview', async (c) => {
    const project = loadProject(db, c);
    const body = await readObject(c.req.raw);
    const preview = previewConfig(body, previewSecretNames(db, project.id));
    const { preview: _old, ...config } = project.config;
    const updated = db
      .update(schema.projects)
      .set({ config: preview ? { ...config, preview } : config })
      .where(eq(schema.projects.id, project.id))
      .returning()
      .get();
    return c.json(toPublicProject(updated));
  });
  routes.put('/:projectId/preview/secrets/:name', async (c) => {
    const project = loadProject(db, c);
    const name = secretName(c, project);
    const { value } = await readObject(c.req.raw);
    if (typeof value !== 'string' || value === '' || value.length > MAX_SECRET_CHARS) {
      throw fail(BAD_REQUEST, 'Give the secret a value');
    }
    setPreviewSecret(db, project.id, name, value);
    return c.json(settingsView(db, project));
  });
  routes.delete('/:projectId/preview/secrets/:name', (c) => {
    const project = loadProject(db, c);
    if (!deletePreviewSecret(db, project.id, c.req.param('name'))) {
      throw fail(NOT_FOUND, 'No such secret');
    }
    return c.json(settingsView(db, project));
  });
  return routes;
}
