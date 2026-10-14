import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { diffSnapshots } from './schema';

/**
 * A ticket's commits at its diff snapshot, oldest first, each with its own files against its first
 * parent. One `since_review` row (no commit of its own) holds the change since the head the user
 * last sent a review on, while that commit is still in the branch.
 */
export const diffCommits = sqliteTable(
  'diff_commits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => diffSnapshots.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['commit', 'since_review'] }).notNull(),
    position: integer('position').notNull(),
    /** The commit; for `since_review`, the head the user reviewed. */
    sha: text('sha').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    author: text('author').notNull().default(''),
    date: text('date'),
    parents: integer('parents').notNull().default(1),
  },
  (t) => [index('diff_commits_snapshot_idx').on(t.snapshotId, t.position)],
);

export const diffCommitFiles = sqliteTable(
  'diff_commit_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    commitId: integer('commit_id')
      .notNull()
      .references(() => diffCommits.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    path: text('path').notNull(),
    oldPath: text('old_path').notNull(),
    status: text('status', { enum: ['added', 'deleted', 'modified', 'renamed'] }).notNull(),
    binary: integer('binary', { mode: 'boolean' }).notNull(),
    additions: integer('additions').notNull(),
    deletions: integer('deletions').notNull(),
    patch: text('patch').notNull(),
  },
  (t) => [index('diff_commit_files_commit_idx').on(t.commitId, t.position)],
);
