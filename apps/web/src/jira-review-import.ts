// Adds a comment of a ticket's Jira issue to its review, as a general draft for the implementer, and says which are.
import {
  isJiraCommentUrl,
  jiraCommentUrl,
  schema,
  type Db,
  type JiraComment,
  type Ticket,
} from '@union/core';
import { and, eq, isNotNull } from 'drizzle-orm';

/** The issue a ticket's comments come from: its key, on its site. */
type Issue = { site: string; key: string };

/** Who wrote it, who may see it in Jira, then its text. */
function commentBody(comment: JiraComment): string {
  const seen = comment.restriction === null ? '' : ` (${comment.restriction.toLowerCase()})`;
  return `**${comment.author}** commented on the Jira issue${seen}:\n\n${comment.markdown}`;
}

/** The ids of the issue's comments already in the ticket's review (sent or not). */
export function importedJiraComments(
  db: Db,
  ticketId: number,
  issue: Issue,
  commentIds: readonly string[],
): string[] {
  const urls = new Set(
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
      .flatMap((row) => (row.url !== null && isJiraCommentUrl(row.url) ? [row.url] : [])),
  );
  return commentIds.filter((id) => urls.has(jiraCommentUrl(issue.site, issue.key, id)));
}

/** Adds the comment as a general draft of the ticket's review; false when it is in it already. */
export function importJiraComment(
  db: Db,
  ticket: Ticket,
  issue: Issue,
  comment: JiraComment,
): boolean {
  if (importedJiraComments(db, ticket.id, issue, [comment.id]).length > 0) {
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
      body: commentBody(comment),
      // A general comment is never outdated: no head to keep.
      headSha: '',
      sourceUrl: jiraCommentUrl(issue.site, issue.key, comment.id),
    })
    .run();
  return true;
}
