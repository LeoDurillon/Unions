// What the review marks on each changed file: ignored by the review's rules, and code by the change size's.
import {
  isCodeFile,
  isIgnoredPath,
  schema,
  sizeIgnoreOf,
  type Db,
  type ProjectConfig,
} from '@union/core';
import { eq } from 'drizzle-orm';

export type FileFlags = { ignored: boolean; code: boolean };

/** The flags of a changed file under the project's config. */
export function fileFlags(
  config: ProjectConfig | undefined,
): (file: { path: string; binary: boolean }) => FileFlags {
  const patterns = config?.reviewIgnore ?? [];
  const hideLockFiles = config?.hideLockFiles !== false;
  const sizeIgnore = sizeIgnoreOf(config ?? {});
  return (file) => ({
    ignored: isIgnoredPath(file.path, patterns, hideLockFiles),
    code: isCodeFile(file, sizeIgnore),
  });
}

/** The flags of a changed file under the config of the project `projectId`. */
export function projectFileFlags(
  db: Db,
  projectId: number,
): (file: { path: string; binary: boolean }) => FileFlags {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  return fileFlags(project?.config);
}
