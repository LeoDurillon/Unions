// Adds a thread of a ticket's tracker item, or one comment of it, to the ticket's review as a general draft.
// The draft is for the implementer. It also says which already are, by the thread's or comment's link kept as the draft's source.
import {
  integrationKind,
  schema,
  type Db,
  type IntegrationKindName,
  type Ticket,
  type TrackerComment,
  type TrackerThread,
} from '@union/core';
import { and, eq, isNotNull } from 'drizzle-orm';

/** Who wrote it, where (and about what text), who may see it in the tracker, then its text. */
function opening(
  kind: IntegrationKindName,
  thread: TrackerThread,
  comment: TrackerComment,
): string {
  const { label, itemLabel } = integrationKind(kind);
  const where =
    thread.place === 'block'
      ? `on a block of the ${label} ${itemLabel}`
      : `on the ${label} ${itemLabel}`;
  const about = thread.quote === null ? '' : `, about "${thread.quote}"`;
  const seen = comment.restriction === null ? '' : ` (${comment.restriction.toLowerCase()})`;
  return `**${comment.author}** commented ${where}${about}${seen}:\n\n${comment.markdown}`;
}

/** The whole thread: who opened it and about what, then each reply. */
function threadBody(kind: IntegrationKindName, thread: TrackerThread): string {
  return thread.comments
    .map((comment, index) =>
      index === 0
        ? opening(kind, thread, comment)
        : `**${comment.author}** replied:\n\n${comment.markdown}`,
    )
    .join('\n\n');
}

/** The sources of the ticket's review comments (sent or not). */
function importedUrls(db: Db, ticketId: number): Set<string> {
  return new Set(
    db
      .select({ url: schema.reviewComments.sourceUrl })
      .from(schema.reviewComments)
      .where(
        and(
          eq(schema.reviewComments.ticketId, ticketId),
          isNotNull(schema.reviewComments.sourceUrl),
        ),
      )
      .all()
      .flatMap((row) => (row.url === null ? [] : [row.url])),
  );
}

/** The ids of what is already in the ticket's review: the threads added whole, and the comments added alone. */
export function importedThreads(
  db: Db,
  ticketId: number,
  threads: readonly TrackerThread[],
): string[] {
  const urls = importedUrls(db, ticketId);
  // A thread of one comment (Jira's) has the comment's id and link: listed once.
  const ids = threads.flatMap((thread) => [
    ...(urls.has(thread.url) ? [thread.id] : []),
    ...thread.comments.filter((comment) => urls.has(comment.url)).map((comment) => comment.id),
  ]);
  return [...new Set(ids)];
}

/** A thread of the item, and the one comment of it to add alone (null: the whole thread). */
type ThreadImport = { thread: TrackerThread; commentId: string | null };

/** Adds the thread (or its one comment) as a general draft; false when it is in the review already. */
export function importThread(
  db: Db,
  ticket: Ticket,
  kind: IntegrationKindName,
  { thread, commentId }: ThreadImport,
): boolean {
  const comment = thread.comments.find((one) => one.id === commentId);
  const sourceUrl = comment ? comment.url : thread.url;
  if (importedUrls(db, ticket.id).has(sourceUrl)) {
    return false;
  }
  db.insert(schema.reviewComments)
    .values({
      ticketId: ticket.id,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      body: comment ? opening(kind, thread, comment) : threadBody(kind, thread),
      // A general comment is never outdated: no head to keep.
      headSha: '',
      sourceUrl,
    })
    .run();
  return true;
}
