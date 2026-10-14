import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  attachmentsRoot,
  findProjectFile,
  formatBytes,
  listProjectFiles,
  maxProjectFileBytes,
  projectFileHostPath,
  projectFilePathProblem,
  projectFilesDir,
  schema,
  type Db,
  type ProjectFile,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CREATED, fail, NOT_FOUND, requireId } from '../http';

const OK = 200;
const NO_CONTENT = 204;
const PAYLOAD_TOO_LARGE = 413;

/** What the browser sees of a file: never its content. */
export type ProjectFileView = Omit<ProjectFile, 'sha256' | 'blobId'>;

function view({ sha256: _sha256, blobId: _blobId, ...rest }: ProjectFile): ProjectFileView {
  return rest;
}

function projectIdOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return id;
}

/** Streams the request body to `to`, refusing it past the size limit. Returns its size. */
async function receive(body: ReadableStream<Uint8Array>, to: string): Promise<number> {
  const max = maxProjectFileBytes();
  const writer = Bun.file(to).writer();
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > max) {
        throw fail(PAYLOAD_TOO_LARGE, `A project file can be at most ${formatBytes(max)}`);
      }
      await writer.write(chunk);
    }
  } finally {
    await writer.end();
  }
  return size;
}

/** Its sha256, and the id git gives the content (to find it in a pushed branch), in one read. */
async function hashes(file: string, size: number): Promise<{ sha256: string; blobId: string }> {
  const sha256 = new Bun.CryptoHasher('sha256');
  const sha1 = new Bun.CryptoHasher('sha1');
  sha1.update(`blob ${size}\0`);
  for await (const chunk of Bun.file(file).stream()) {
    sha256.update(chunk);
    sha1.update(chunk);
  }
  return { sha256: sha256.digest('hex'), blobId: sha1.digest('hex') };
}

function save(
  db: Db,
  projectId: number,
  filePath: string,
  fields: Partial<ProjectFile>,
): ProjectFile {
  const values = { size: 0, sha256: '', blobId: '', ...fields, updatedAt: Date.now() };
  return db
    .insert(schema.projectFiles)
    .values({ ...values, projectId, path: filePath })
    .onConflictDoUpdate({
      target: [schema.projectFiles.projectId, schema.projectFiles.path],
      set: values,
    })
    .returning()
    .get();
}

/** `PUT ?path=…` with the file as the body: adds the file, or replaces the one at that path. */
async function upload(db: Db, c: Context): Promise<Response> {
  const projectId = projectIdOf(db, c);
  const filePath = (c.req.query('path') ?? '').trim();
  const problem = projectFilePathProblem(filePath);
  if (problem) {
    throw fail(BAD_REQUEST, problem);
  }
  const { body } = c.req.raw;
  if (!body) {
    throw fail(BAD_REQUEST, 'Send the file as the request body');
  }
  const incoming = path.join(attachmentsRoot(), '.incoming');
  await mkdir(incoming, { recursive: true });
  await mkdir(projectFilesDir(projectId), { recursive: true });
  const temporary = path.join(incoming, `p${projectId}-${crypto.randomUUID()}`);
  try {
    const size = await receive(body, temporary);
    const existed = listProjectFiles(db, projectId).some((file) => file.path === filePath);
    const row = save(db, projectId, filePath, { size, ...(await hashes(temporary, size)) });
    await rename(temporary, projectFileHostPath(row));
    return c.json(view(row), existed ? OK : CREATED);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function remove(db: Db, c: Context): Promise<Response> {
  const projectId = projectIdOf(db, c);
  const file = findProjectFile(db, projectId, requireId(c.req.param('fileId'), 'file id'));
  if (!file) {
    throw fail(NOT_FOUND, 'File not found');
  }
  db.delete(schema.projectFiles).where(eq(schema.projectFiles.id, file.id)).run();
  await rm(projectFileHostPath(file), { force: true });
  return c.body(null, NO_CONTENT);
}

/** Under `/api/projects`: `/:projectId/files`. */
export function projectFileRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/files', (c) =>
    c.json(listProjectFiles(db, projectIdOf(db, c)).map((file) => view(file))),
  );
  routes.put('/:projectId/files', (c) => upload(db, c));
  routes.delete('/:projectId/files/:fileId', (c) => remove(db, c));
  return routes;
}

/** Deletes a removed project's files (its rows went with it, by cascade). */
export async function removeProjectFiles(projectId: number): Promise<void> {
  await rm(projectFilesDir(projectId), { recursive: true, force: true });
}
