// Tests for the paths a preview's exposed services answer under, as the target carries them.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type PreviewService,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { previewSettings } from './compose';
import { loadTarget, type PreviewDeps } from './target';

let db: Db;
let projectId: number;
let ticketId: number;

function deps(): PreviewDeps {
  return { db, runtime: {} as ContainerRuntime, settings: previewSettings({}) };
}

function expose(api: PreviewService, domainPerPreview = false): void {
  const config = {
    baseBranch: 'main',
    preview: {
      composeFile: 'compose.yaml',
      services: [{ name: 'editor', port: 3001, prefix: '' }, api],
      env: { API: '{service.api.url}' },
      ...(domainPerPreview ? { domainPerPreview: true } : {}),
    },
  };
  db.update(schema.projects).set({ config }).where(eq(schema.projects.id, projectId)).run();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'T', body: '' }).id;
  db.update(schema.tickets)
    .set({ workspaceVolume: `union-t${ticketId}-ws` })
    .where(eq(schema.tickets.id, ticketId))
    .run();
});

test("a path's host is the other service's full host name; a service without paths has none", () => {
  expose({
    name: 'api',
    port: 3000,
    prefix: 'api',
    paths: [{ host: '', path: '/api', strip: true }],
  });
  expect(loadTarget(deps(), { ticketId }).exposed).toEqual([
    { service: 'editor', port: 3001, host: `t${ticketId}.union.localhost` },
    {
      service: 'api',
      port: 3000,
      host: `api-t${ticketId}.union.localhost`,
      paths: [{ host: `t${ticketId}.union.localhost`, path: '/api', strip: true }],
    },
  ]);
});

test('a path no exposed service hosts stops the start, with where to fix it', () => {
  expose({
    name: 'api',
    port: 3000,
    prefix: 'api',
    paths: [{ host: 'admin', path: '/api', strip: true }],
  });
  expect(() => loadTarget(deps(), { ticketId })).toThrow(
    `api: no exposed service has the host prefix "admin" (the project's Environments tab)`,
  );
});

test('with a domain per preview, every host and address is under the preview host', () => {
  expose(
    { name: 'api', port: 3000, prefix: 'api', paths: [{ host: 'api', path: '/x', strip: true }] },
    true,
  );
  expect(() => loadTarget(deps(), { ticketId })).toThrow('its own host');
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        preview: {
          composeFile: 'compose.yaml',
          services: [
            { name: 'editor', port: 3001, prefix: '' },
            { name: 'viewer', port: 3002, prefix: 'viewer' },
            {
              name: 'api',
              port: 3000,
              prefix: 'api',
              paths: [{ host: 'viewer', path: '/api', strip: true }],
            },
          ],
          env: { API: '{service.api.url}' },
          domainPerPreview: true,
        },
      },
    })
    .where(eq(schema.projects.id, projectId))
    .run();
  const target = loadTarget(deps(), { ticketId });
  expect(target.exposed[2]).toEqual({
    service: 'api',
    port: 3000,
    host: `api.t${ticketId}.union.localhost`,
    paths: [{ host: `viewer.t${ticketId}.union.localhost`, path: '/api', strip: true }],
  });
  expect(target.urls.map(({ url }) => url)).toEqual([
    `http://t${ticketId}.union.localhost:8080`,
    `http://viewer.t${ticketId}.union.localhost:8080`,
    `http://api.t${ticketId}.union.localhost:8080`,
  ]);
  expect(target.plain.API).toBe(`http://api.t${ticketId}.union.localhost:8080`);
});
