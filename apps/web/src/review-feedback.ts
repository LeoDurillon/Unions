// The review the user sends, as the implementer receives it.
import { schema, type Db, type ReviewComment } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';

type Draft = Pick<
  ReviewComment,
  'kind' | 'path' | 'side' | 'startLine' | 'endLine' | 'excerpt' | 'body'
>;

function lines(comment: Draft): string {
  const range =
    comment.startLine === comment.endLine
      ? `Line ${comment.startLine}`
      : `Lines ${comment.startLine}-${comment.endLine}`;
  return comment.side === 'old' ? `${range} (removed code)` : range;
}

/**
 * The review as the implementer receives it: overall note, the comments on the whole pull request,
 * then each line comment under its file.
 */
export function formatReview(
  comments: readonly Draft[],
  summary: string,
  slicesOf: (path: string) => readonly string[] = () => [],
): string {
  const parts = ['# Code review from the user'];
  if (summary.trim() !== '') {
    parts.push(summary.trim());
  }
  const general = comments.filter((comment) => comment.kind === 'general');
  if (general.length > 0) {
    parts.push('## On the pull request', ...general.map((comment) => comment.body.trim()));
  }
  const onLines = comments.filter((comment) => comment.kind === 'line');
  const paths = [...new Set(onLines.map((comment) => comment.path))];
  for (const path of paths) {
    const slices = slicesOf(path);
    parts.push(
      slices.length === 0 ? `## ${path}` : `## ${path}\n\nChanged in ${slices.join(' and ')}.`,
    );
    for (const comment of onLines.filter((candidate) => candidate.path === path)) {
      parts.push(
        `**${lines(comment)}**\n\n\`\`\`\n${comment.excerpt}\n\`\`\`\n\n${comment.body.trim()}`,
      );
    }
  }
  return parts.join('\n\n');
}

/** For a split ticket: the slices whose own change touches each path, as the newest snapshot has them. */
function slicesByPath(db: Db, ticketId: number): Map<string, string[]> {
  const snapshot = db
    .select({ id: schema.diffSnapshots.id })
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  const found = new Map<string, string[]>();
  if (!snapshot) {
    return found;
  }
  const rows = db
    .select({
      position: schema.diffCommits.position,
      title: schema.diffCommits.title,
      path: schema.diffCommitFiles.path,
    })
    .from(schema.diffCommits)
    .innerJoin(schema.diffCommitFiles, eq(schema.diffCommitFiles.commitId, schema.diffCommits.id))
    .where(
      and(eq(schema.diffCommits.snapshotId, snapshot.id), eq(schema.diffCommits.kind, 'slice')),
    )
    .orderBy(schema.diffCommits.position)
    .all();
  for (const row of rows) {
    found.set(row.path, [...(found.get(row.path) ?? []), `slice ${row.position} (${row.title})`]);
  }
  return found;
}

/**
 * A ticket's review: on a split ticket each file says which slices change it, so the implementer
 * knows where its fix goes (`Slice: <n>` or `fixup! <sha>`).
 */
export function formatTicketReview(
  db: Db,
  ticketId: number,
  input: { comments: readonly Draft[]; summary: string },
): string {
  const slices = slicesByPath(db, ticketId);
  return formatReview(input.comments, input.summary, (path) => slices.get(path) ?? []);
}
