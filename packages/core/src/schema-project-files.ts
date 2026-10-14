import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { now, projects } from './schema';

/**
 * Files the user gave the project (a database dump, a local config), put at `path` in every ticket's
 * workspace and kept out of git there. Stored on the host under the attachments folder; the browser
 * can replace or remove one, never read it back. `blobId` (git) lets a push that contains one be
 * refused; `sha256` tells a workspace that already holds the current content.
 */
export const projectFiles = sqliteTable(
  'project_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    blobId: text('blob_id').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('project_files_path_idx').on(t.projectId, t.path)],
);
