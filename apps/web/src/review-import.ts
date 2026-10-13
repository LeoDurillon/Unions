import { diffExcerpt, githubText, schema, type Db } from '@union/core';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import type { PullRequestNote, PullRequestThread, ReviewImportResult } from './api-types';

type Thread = PullRequestThread;
type Snapshot = { headSha: string; patches: Map<string, string> };
type Draft = Omit<typeof schema.reviewComments.$inferInsert, 'ticketId'>;

/** The thread as one comment: who said what, the first comment then the replies. */
export function threadBody(thread: Thread): string {
  return thread.comments
    .map(
      (comment, index) =>
        `**@${comment.author}** ${index === 0 ? 'on GitHub' : 'replied'}:\n\n${githubText(comment.body)}`,
    )
    .join('\n\n');
}

/** The last `count` code lines of a GitHub diff hunk (it ends at the commented line), without +/- signs. */
function hunkTail(hunk: string, count: number): string {
  const code = hunk.split('\n').filter((line) => !line.startsWith('@@'));
  return code
    .slice(-count)
    .map((line) => line.slice(1))
    .join('\n');
}

/** Where the thread sits in the ticket's current diff, if it still does. */
function current(
  thread: Thread,
  snapshot: Snapshot | null,
): { start: number; end: number; excerpt: string } | null {
  const patch = snapshot?.patches.get(thread.path);
  if (thread.line === null || patch === undefined) {
    return null;
  }
  const start = thread.startLine ?? thread.line;
  const excerpt = diffExcerpt(patch, thread.side, start, thread.line);
  return excerpt === null ? null : { start, end: thread.line, excerpt };
}

/**
 * A draft from an unresolved thread. It lands on its lines of the current diff when they are still
 * there; otherwise it keeps the lines it was written on and reads as outdated, with GitHub's excerpt.
 */
export function draftFromThread(thread: Thread, snapshot: Snapshot | null): Draft | null {
  const [first] = thread.comments;
  if (!first) {
    return null;
  }
  const github = { githubUrl: first.url, body: threadBody(thread) };
  const here = current(thread, snapshot);
  if (here && snapshot) {
    const { start, end, excerpt } = here;
    return {
      ...github,
      path: thread.path,
      side: thread.side,
      startLine: start,
      endLine: end,
      excerpt,
      headSha: snapshot.headSha,
    };
  }
  const end = thread.originalLine ?? thread.line ?? 1;
  const start = Math.min(thread.originalStartLine ?? end, end);
  // A different head marks it outdated; GitHub's own commit could match ours, so it is never reused.
  const headSha = first.commitSha === snapshot?.headSha ? '' : first.commitSha;
  return {
    ...github,
    path: thread.path,
    side: thread.side,
    startLine: start,
    endLine: end,
    excerpt: hunkTail(first.diffHunk, end - start + 1),
    headSha,
  };
}

function loadSnapshot(db: Db, ticketId: number): Snapshot | null {
  const snapshot = db
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
  if (!snapshot) {
    return null;
  }
  const files = db
    .select()
    .from(schema.diffFiles)
    .where(eq(schema.diffFiles.snapshotId, snapshot.id))
    .all();
  return {
    headSha: snapshot.headSha,
    patches: new Map(files.map((file) => [file.path, file.patch])),
  };
}

/** The GitHub links of everything already imported on the ticket (sent or not). */
export function importedUrls(db: Db, ticketId: number): string[] {
  return db
    .select({ url: schema.reviewComments.githubUrl })
    .from(schema.reviewComments)
    .where(
      and(eq(schema.reviewComments.ticketId, ticketId), isNotNull(schema.reviewComments.githubUrl)),
    )
    .all()
    .flatMap((row) => (row.url === null ? [] : [row.url]));
}

/** Adds the unresolved threads not imported yet as draft comments on the ticket. */
export function importThreads(db: Db, ticketId: number, threads: Thread[]): ReviewImportResult {
  const known = new Set(importedUrls(db, ticketId));
  const snapshot = loadSnapshot(db, ticketId);
  const result: ReviewImportResult = { imported: 0, alreadyImported: 0, resolved: 0 };
  const drafts: Draft[] = [];
  for (const thread of threads) {
    const draft = thread.resolved ? null : draftFromThread(thread, snapshot);
    if (thread.resolved) {
      result.resolved += 1;
    } else if (draft && known.has(draft.githubUrl ?? '')) {
      result.alreadyImported += 1;
    } else if (draft) {
      drafts.push(draft);
    }
  }
  if (drafts.length > 0) {
    db.insert(schema.reviewComments)
      .values(drafts.map((draft) => ({ ...draft, ticketId })))
      .run();
  }
  result.imported = drafts.length;
  return result;
}

const REVIEW_STATES: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  DISMISSED: 'reviewed (dismissed)',
};

/** Who wrote it and how, then the text. */
export function noteBody(note: PullRequestNote): string {
  const how =
    note.kind === 'review'
      ? `${REVIEW_STATES[note.state ?? ''] ?? 'reviewed'} on GitHub`
      : 'commented on GitHub';
  return `**@${note.author}** ${how}:\n\n${githubText(note.body)}`;
}

/**
 * Adds a review summary or conversation comment as a general draft (about the whole pull request);
 * false when it was imported already.
 */
export function importNote(db: Db, ticketId: number, note: PullRequestNote): boolean {
  if (importedUrls(db, ticketId).includes(note.url)) {
    return false;
  }
  db.insert(schema.reviewComments)
    .values({
      ticketId,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      body: noteBody(note),
      headSha: loadSnapshot(db, ticketId)?.headSha ?? '',
      githubUrl: note.url,
    })
    .run();
  return true;
}
