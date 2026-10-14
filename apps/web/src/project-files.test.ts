import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  gitBlobId,
  listProjectFiles,
  migrateDb,
  privatePushFiles,
  projectFileHostPath,
  projectFilePathProblem,
  schema,
  type Db,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

const root = await mkdtemp(path.join(tmpdir(), 'union-project-files-'));
process.env.UNION_ATTACHMENTS_DIR = root;

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

afterEach(() => {
  delete process.env.UNION_MAX_PROJECT_FILE_MB;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function put(filePath: string, content: string): Response | Promise<Response> {
  return app.request(`/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    body: content,
  });
}

test('a file is stored under the project, and the browser never sees its content or hashes', async () => {
  const created = await put('goreno.sql', 'CREATE TABLE a;');
  expect(created.status).toBe(201);
  const [row] = listProjectFiles(db, projectId);
  expect(row).toMatchObject({ path: 'goreno.sql', size: 15 });
  expect(row?.blobId).toBe(gitBlobId(new TextEncoder().encode('CREATE TABLE a;')));
  expect(await readFile(projectFileHostPath(row ?? { projectId, id: 0 }), 'utf8')).toBe(
    'CREATE TABLE a;',
  );
  const listed: unknown = await (await app.request(`/api/projects/${projectId}/files`)).json();
  expect(listed).toEqual([expect.objectContaining({ path: 'goreno.sql', size: 15 })]);
  expect(JSON.stringify(listed)).not.toMatch(/sha256|blobId/u);
});

test('uploading to a path already used replaces that file', async () => {
  await put('dev/seed.sql', 'one');
  const replaced = await put('dev/seed.sql', 'two, longer');
  expect(replaced.status).toBe(200);
  const rows = listProjectFiles(db, projectId);
  expect(rows).toHaveLength(1);
  expect(await readFile(projectFileHostPath(rows[0] ?? { projectId, id: 0 }), 'utf8')).toBe(
    'two, longer',
  );
});

test('paths stay inside the repository and out of .git', async () => {
  for (const bad of ['', '/etc/passwd', '../x', 'a/../b', '.git/config', 'a b.sql', "it's"]) {
    expect(projectFilePathProblem(bad)).not.toBeNull();
  }
  expect(projectFilePathProblem('.env.local')).toBeNull();
  expect(projectFilePathProblem('dev/data/goreno.sql')).toBeNull();
  expect((await put('../escape', 'x')).status).toBe(400);
  expect(listProjectFiles(db, projectId)).toEqual([]);
});

test('a file over the limit is refused and leaves nothing behind', async () => {
  process.env.UNION_MAX_PROJECT_FILE_MB = String(10 / (1024 * 1024));
  expect((await put('big.sql', 'x'.repeat(11))).status).toBe(413);
  expect(listProjectFiles(db, projectId)).toEqual([]);
  expect(await readdirOrEmpty(path.join(root, '.incoming'))).toEqual([]);
});

function readdirOrEmpty(dir: string): Promise<string[]> {
  return readdir(dir).catch(() => []);
}

test('removing a file deletes it from disk; a push must not contain any project file', async () => {
  await put('goreno.sql', 'dump');
  const [row] = listProjectFiles(db, projectId);
  const ticket = createTicket(db, { projectId, title: 'Seed' });
  expect(privatePushFiles(db, ticket)).toEqual([
    { name: 'goreno.sql (a project file)', blobId: row?.blobId ?? '' },
  ]);
  const removed = await app.request(`/api/projects/${projectId}/files/${row?.id}`, {
    method: 'DELETE',
  });
  expect(removed.status).toBe(204);
  expect(listProjectFiles(db, projectId)).toEqual([]);
  const gone = await access(projectFileHostPath(row ?? { projectId, id: 0 })).then(
    () => false,
    () => true,
  );
  expect(gone).toBe(true);
});
