// Connecting a project to a tracker, reading its columns again, and importing one of its items; the tracker is only read.
import {
  integrationKind,
  integrationOf,
  integrationProvider,
  isIntegrationKindName,
  removeIntegration,
  saveIntegration,
  schema,
  storeFields,
  type Db,
  type Integration,
  type IntegrationApis,
  type IntegrationKindName,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { SourceImport } from '../api-integration-types';
import {
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  optionalText,
  readObject,
  requireText,
} from '../http';
import { toPublicIntegration } from '../public-project';
import { guarded } from './notion';

function kindOf(c: Context): IntegrationKindName {
  const kind = c.req.param('kind') ?? '';
  if (!isIntegrationKindName(kind)) {
    throw fail(NOT_FOUND, `Unknown integration: ${kind}`);
  }
  return kind;
}

function configOf(
  kind: IntegrationKindName,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const read = integrationKind(kind).readConfig(body.config);
  if ('error' in read) {
    throw fail(BAD_REQUEST, read.error);
  }
  return read.config;
}

/** The project's integration of this kind, complete enough to call the tracker. */
function readyIntegration(db: Db, c: Context): Integration {
  const kind = kindOf(c);
  const integration = integrationOf(db, Number(c.req.param('projectId')), kind);
  const { label } = integrationKind(kind);
  if (!integration || 'error' in integrationKind(kind).readConfig(integration.config)) {
    throw fail(
      CONFLICT,
      `This project is not connected to ${label}: set it up in the project settings`,
    );
  }
  return integration;
}

/** The integrations a new project is created with (`integrations: [{ kind, secret, config }]`). */
export function newIntegrationsOf(
  body: Record<string, unknown>,
): { kind: IntegrationKindName; secret: string; config: Record<string, unknown> }[] {
  const { integrations = [] } = body;
  if (!Array.isArray(integrations)) {
    throw fail(BAD_REQUEST, 'integrations must be a list');
  }
  return integrations.map((entry: unknown) => {
    const item = typeof entry === 'object' && entry !== null ? { ...entry } : {};
    const kind = 'kind' in item && typeof item.kind === 'string' ? item.kind : '';
    if (!isIntegrationKindName(kind)) {
      throw fail(BAD_REQUEST, `Unknown integration: ${kind}`);
    }
    return { kind, secret: requireText(item, 'secret'), config: configOf(kind, item) };
  });
}

/** Checks a secret and config before any project has them (onboarding, settings). */
async function verify(apis: IntegrationApis, c: Context): Promise<Response> {
  const kind = kindOf(c);
  const body = await readObject(c.req.raw);
  const secret = requireText(body, 'secret');
  const config = configOf(kind, body);
  const { title } = await guarded(() => integrationProvider(kind, apis).verify(secret, config));
  return c.json({ title, config });
}

/**
 * Reads the tracker's columns with the new secret and config, then saves them: a typo never replaces
 * a working connection. Without a secret, the stored one is kept (the browser never has it).
 */
async function save(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const kind = kindOf(c);
  const projectId = Number(c.req.param('projectId'));
  if (!db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  const body = await readObject(c.req.raw);
  const config = configOf(kind, body);
  const secret = optionalText(body, 'secret') ?? integrationOf(db, projectId, kind)?.secret;
  if (!secret) {
    throw fail(BAD_REQUEST, 'Give the integration secret');
  }
  const read = await guarded(() => integrationProvider(kind, apis).readFields(secret, config));
  const saved = saveIntegration(db, projectId, kind, { secret, config });
  return c.json(toPublicIntegration(storeFields(db, saved.id, read)));
}

/** Reads the tracker's columns again (event rules point at them by id). */
async function refreshFields(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const integration = readyIntegration(db, c);
  const { secret, config } = integration;
  const read = await guarded(() =>
    integrationProvider(integration.kind, apis).readFields(secret, config),
  );
  return c.json(toPublicIntegration(storeFields(db, integration.id, read)));
}

/** An item of the integration's source as a ticket preview; items outside it are refused. */
async function importItem(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const integration = readyIntegration(db, c);
  const kind = integrationKind(integration.kind);
  const body = await readObject(c.req.raw);
  const id = kind.parseRef(requireText(body, 'ref'));
  if (!id) {
    throw fail(BAD_REQUEST, `That is not a ${kind.label} ${kind.itemLabel} ID or URL`);
  }
  const provider = integrationProvider(integration.kind, apis);
  const item = await guarded(() => provider.item(integration.secret, integration.config, id));
  const result: SourceImport = {
    title: item.title || `Untitled ${kind.label} ${kind.itemLabel}`,
    body: `${item.markdown}\n\n---\nImported from ${kind.label}: ${item.url}`,
    url: item.url,
    truncated: item.truncated,
    id: item.id,
  };
  return c.json(result);
}

/** `/api/integrations`: what needs no project. */
export function integrationRoutes(apis: IntegrationApis): Hono {
  const routes = new Hono();
  routes.post('/:kind/verify', (c) => verify(apis, c));
  return routes;
}

/** `/api/projects/:projectId/integrations/:kind`: a project's connection to a tracker. */
export function projectIntegrationRoutes(db: Db, apis: IntegrationApis): Hono {
  const routes = new Hono();
  routes.put('/:projectId/integrations/:kind', (c) => save(db, apis, c));
  routes.delete('/:projectId/integrations/:kind', (c) => {
    removeIntegration(db, Number(c.req.param('projectId')), kindOf(c));
    return c.json({ ok: true });
  });
  routes.post('/:projectId/integrations/:kind/fields', (c) => refreshFields(db, apis, c));
  routes.post('/:projectId/integrations/:kind/import', (c) => importItem(db, apis, c));
  return routes;
}
