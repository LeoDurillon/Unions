import { getTicket, isIgnoredPath, schema, type Db, type Ticket } from '@union/core';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import {
  SINCE_REVIEW,
  slicePosition,
  type CommitDiffResponse,
  type CommitsResponse,
} from '../api-types';
import { fail, NOT_FOUND, requireId } from '../http';

type CommitRow = typeof schema.diffCommits.$inferSelect;

function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

/** The commits stored with the ticket's newest diff snapshot, in order; none before a first one. */
function commitRows(db: Db, ticketId: number): CommitRow[] {
  const snapshot = db
    .select({ id: schema.diffSnapshots.id })
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  if (!snapshot) {
    return [];
  }
  return db
    .select()
    .from(schema.diffCommits)
    .where(eq(schema.diffCommits.snapshotId, snapshot.id))
    .orderBy(asc(schema.diffCommits.position))
    .all();
}

function listCommits(rows: CommitRow[]): CommitsResponse {
  const commits = rows.filter((row) => row.kind === 'commit');
  const since = rows.find((row) => row.kind === 'since_review');
  const slices = rows
    .filter((row) => row.kind === 'slice')
    .map(({ position, title, sha }) => ({ position, title, sha }));
  const reviewedAt = commits.findIndex((row) => row.sha === since?.sha);
  return {
    commits: commits.map(({ sha, title, body, author, date, parents }) => ({
      sha,
      title,
      body,
      author,
      date,
      parents,
    })),
    sinceReview: since ? { sha: since.sha, commits: commits.length - reviewedAt - 1 } : null,
    ...(slices.length > 0 ? { slices } : {}),
  };
}

/** Whether `row` is the one the path names: a SHA, `since-review`, or `slice-<position>`. */
function named(row: CommitRow, ref: string): boolean {
  const slice = slicePosition(ref);
  if (slice !== null) {
    return row.kind === 'slice' && row.position === slice;
  }
  return ref === SINCE_REVIEW
    ? row.kind === 'since_review'
    : row.kind === 'commit' && row.sha === ref;
}

/** The commit (or slice) named in the path in the newest snapshot. */
function commitOf(db: Db, c: Context): { ticket: Ticket; row: CommitRow } {
  const ticket = loadTicket(db, c);
  const ref = c.req.param('sha') ?? '';
  const row = commitRows(db, ticket.id).find((candidate) => named(candidate, ref));
  if (!row) {
    throw fail(NOT_FOUND, 'This commit is not in the newest diff of the ticket');
  }
  return { ticket, row };
}

function ignoreRule(db: Db, ticket: Ticket): (path: string) => boolean {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const patterns = project?.config.reviewIgnore ?? [];
  const hideLockFiles = project?.config.hideLockFiles !== false;
  return (path) => isIgnoredPath(path, patterns, hideLockFiles);
}

/**
 * `/api/tickets/:id/commits`: the commits stored with the ticket's diff snapshot, the change since the
 * last review, a split ticket's slices, and their files. Read only: comments are written on the whole diff.
 */
export function ticketCommitRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listCommits(commitRows(db, loadTicket(db, c).id))));
  routes.get('/:sha/diff', (c) => {
    const { ticket, row } = commitOf(db, c);
    const ignored = ignoreRule(db, ticket);
    const files = db
      .select()
      .from(schema.diffCommitFiles)
      .where(eq(schema.diffCommitFiles.commitId, row.id))
      .orderBy(asc(schema.diffCommitFiles.position))
      .all();
    const body: CommitDiffResponse = {
      sha: row.sha,
      files: files.map(({ id, path, oldPath, status, binary, additions, deletions }) => ({
        id,
        path,
        oldPath,
        status,
        binary,
        additions,
        deletions,
        ignored: ignored(path),
      })),
    };
    return c.json(body);
  });
  routes.get('/:sha/files/:fileId', (c) => {
    const { row } = commitOf(db, c);
    const fileId = requireId(c.req.param('fileId'), 'file id');
    const file = db
      .select({
        id: schema.diffCommitFiles.id,
        path: schema.diffCommitFiles.path,
        patch: schema.diffCommitFiles.patch,
      })
      .from(schema.diffCommitFiles)
      .where(
        and(eq(schema.diffCommitFiles.id, fileId), eq(schema.diffCommitFiles.commitId, row.id)),
      )
      .get();
    if (!file) {
      throw fail(NOT_FOUND, 'File not found in the commit');
    }
    return c.json(file);
  });
  return routes;
}
