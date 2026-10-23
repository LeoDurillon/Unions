// Files the user gives a project: kept on the host, put at a path in the repository, and never
// pushed.
import path from 'node:path';

import { and, asc, eq } from 'drizzle-orm';

import { attachmentsRoot, privateAttachments } from './attachments';
import type { Db } from './db';
import * as schema from './tables';

export type ProjectFile = typeof schema.projectFiles.$inferSelect;

const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;
const DEFAULT_MAX_MIB = 2048;
const MAX_PATH_LENGTH = 200;
/** One folder or file name: characters the workspace scripts never need to quote. */
const SEGMENT = /^[\w.@+-]+$/u;

/** The largest project file, in bytes: `UNION_MAX_PROJECT_FILE_MB` (2048 by default). */
export function maxProjectFileBytes(): number {
  const configured = Number(process.env.UNION_MAX_PROJECT_FILE_MB);
  return (Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_MIB) * MEBIBYTE;
}

/** The host folder holding one project's files, each under its row id. */
export function projectFilesDir(projectId: number): string {
  return path.join(attachmentsRoot(), `p${projectId}`);
}

export function projectFileHostPath(file: Pick<ProjectFile, 'projectId' | 'id'>): string {
  return path.join(projectFilesDir(file.projectId), String(file.id));
}

/**
 * Why `value` cannot be where a file goes in the repository, or null: a relative path of plain
 * names, never climbing out of it nor into `.git`.
 */
export function projectFilePathProblem(value: string): string | null {
  const segments = value.split('/');
  if (value === '' || value.length > MAX_PATH_LENGTH) {
    return `Give a path inside the repository, at most ${MAX_PATH_LENGTH} characters`;
  }
  if (segments.some((segment) => !SEGMENT.test(segment) || /^\.+$/u.test(segment))) {
    return 'A path is folder and file names joined by "/": letters, digits and . _ - + @ only';
  }
  return segments[0] === '.git' ? 'A file cannot go in the .git folder' : null;
}

export function listProjectFiles(db: Db, projectId: number): ProjectFile[] {
  return db
    .select()
    .from(schema.projectFiles)
    .where(eq(schema.projectFiles.projectId, projectId))
    .orderBy(asc(schema.projectFiles.path))
    .all();
}

export function findProjectFile(db: Db, projectId: number, id: number): ProjectFile | undefined {
  return db
    .select()
    .from(schema.projectFiles)
    .where(and(eq(schema.projectFiles.projectId, projectId), eq(schema.projectFiles.id, id)))
    .get();
}

/**
 * The files a ticket's push must not contain, by git blob id: its attachments not allowed in the
 * repository, and every project file.
 */
export function privatePushFiles(
  db: Db,
  ticket: { id: number; projectId: number },
): { name: string; blobId: string }[] {
  return [
    ...privateAttachments(db, ticket.id).map(({ name, blobId }) => ({ name, blobId })),
    ...listProjectFiles(db, ticket.projectId).map((file) => ({
      name: `${file.path} (a project file)`,
      blobId: file.blobId,
    })),
  ];
}
