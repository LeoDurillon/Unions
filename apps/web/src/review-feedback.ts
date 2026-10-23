// The review the user sends, as the implementer receives it.
import { schema, type Db, type ReviewComment } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';

import { reviewSlices } from './slice-snapshot';

type Draft = Pick<
  ReviewComment,
  'kind' | 'path' | 'side' | 'startLine' | 'endLine' | 'excerpt' | 'body'
> & { slicePosition?: number | null };

/** A slice of a split ticket, as its section of the review names it. */
export type ReviewSlice = { position: number; title: string; sha: string; prNumber: number | null };

const SHORT_SHA = 7;
const HEADER = '# Code review from the user';

function lines(comment: Draft): string {
  const range =
    comment.startLine === comment.endLine
      ? `Line ${comment.startLine}`
      : `Lines ${comment.startLine}-${comment.endLine}`;
  return comment.side === 'old' ? `${range} (removed code)` : range;
}

/** The comments under headings of `level` (`##`): the general ones, then each file's line comments. */
function commentParts(
  comments: readonly Draft[],
  level: string,
  slicesOf: (path: string) => readonly string[],
): string[] {
  const parts: string[] = [];
  const general = comments.filter((comment) => comment.kind === 'general');
  if (general.length > 0) {
    parts.push(`${level} On the pull request`, ...general.map((comment) => comment.body.trim()));
  }
  const onLines = comments.filter((comment) => comment.kind === 'line');
  for (const path of new Set(onLines.map((comment) => comment.path))) {
    const slices = slicesOf(path);
    const heading = `${level} ${path}`;
    parts.push(slices.length === 0 ? heading : `${heading}\n\nChanged in ${slices.join(' and ')}.`);
    for (const comment of onLines.filter((candidate) => candidate.path === path)) {
      parts.push(
        `**${lines(comment)}**\n\n\`\`\`\n${comment.excerpt}\n\`\`\`\n\n${comment.body.trim()}`,
      );
    }
  }
  return parts;
}

function opening(summary: string): string[] {
  return summary.trim() === '' ? [HEADER] : [HEADER, summary.trim()];
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
  return [...opening(summary), ...commentParts(comments, '##', slicesOf)].join('\n\n');
}

function sliceHeading(slice: ReviewSlice): string {
  const pr = slice.prNumber === null ? '' : ` (#${slice.prNumber})`;
  return `## Slice ${slice.position}: ${slice.title}${pr}\n\nOn this slice's own change: line numbers are at its tip (\`${slice.sha.slice(0, SHORT_SHA)}\`). Fix these in slice ${slice.position}.`;
}

/**
 * A split ticket's review: the comments on the whole change as `formatReview` writes them, then a
 * section per slice with the comments written on that slice's own change.
 */
export function formatStackReview(
  comments: readonly Draft[],
  summary: string,
  slices: readonly ReviewSlice[],
  slicesOf: (path: string) => readonly string[] = () => [],
): string {
  const positions = new Set(slices.map((slice) => slice.position));
  const onSlice = (comment: Draft): boolean =>
    comment.slicePosition !== undefined &&
    comment.slicePosition !== null &&
    positions.has(comment.slicePosition);
  const whole = comments.filter((comment) => !onSlice(comment));
  const parts = [...opening(summary), ...commentParts(whole, '##', slicesOf)];
  for (const slice of slices) {
    const own = comments.filter((comment) => comment.slicePosition === slice.position);
    if (own.length > 0) {
      parts.push(sliceHeading(slice), ...commentParts(own, '###', () => []));
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
 * A ticket's review: on a split ticket each file of the whole change says which slices change it,
 * and the comments on a slice's own change come under it, so the implementer knows where its fix
 * goes (`Slice: <n>` or `fixup! <sha>`).
 */
export function formatTicketReview(
  db: Db,
  ticketId: number,
  input: { comments: readonly Draft[]; summary: string },
): string {
  const slices = slicesByPath(db, ticketId);
  return formatStackReview(
    input.comments,
    input.summary,
    reviewSlices(db, ticketId),
    (path) => slices.get(path) ?? [],
  );
}
