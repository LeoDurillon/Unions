// What a stopped worker left half-sent: a pull request review and replies marked `sending`. Only
// those whose command it had already taken.

import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';

/** Shown as "Posting failed: {this}. The comments are still drafts: send again." */
export const REVIEW_SEND_STOPPED =
  'Union stopped while posting it, so it may already be on GitHub (check the pull request before sending again)';
export const REPLY_SEND_STOPPED =
  'Union stopped while posting it, so it may already be on GitHub (check the thread before sending again)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The reviews and comments whose send is still queued: the worker posts those after it starts. */
function queued(db: Db): { reviews: Set<number>; comments: Set<number> } {
  const rows = db
    .select({ type: schema.commands.type, payload: schema.commands.payload })
    .from(schema.commands)
    .where(
      and(
        isNull(schema.commands.handledAt),
        inArray(schema.commands.type, ['submit_pr_review', 'reply_pr_comment']),
      ),
    )
    .all();
  const reviews = new Set<number>();
  const comments = new Set<number>();
  for (const { type, payload } of rows) {
    const record = isRecord(payload) ? payload : {};
    if (type === 'submit_pr_review' && typeof record.reviewId === 'number') {
      reviews.add(record.reviewId);
    }
    const { target } = record;
    if (isRecord(target) && target.kind === 'comment' && typeof target.commentId === 'number') {
      comments.add(target.commentId);
    }
  }
  return { reviews, comments };
}

/**
 * Run once when the worker starts. A review or reply still `sending` whose command was already taken
 * was cut off mid-post: it may or may not have reached GitHub. It goes back to where the user can send
 * it again (the review `failed`, the reply a draft), with a note to check GitHub first, rather than
 * being posted twice. One whose command is still queued is left alone. Returns how many were reset.
 */
export function recoverGitHubSends(db: Db): { reviews: number; replies: number } {
  const pending = queued(db);
  const reviews = db
    .select({ id: schema.currentReviews.id })
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.submitStatus, 'sending'))
    .all()
    .map((row) => row.id)
    .filter((id) => !pending.reviews.has(id));
  const replies = db
    .select({ id: schema.reviewComments.id })
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.replyStatus, 'sending'))
    .all()
    .map((row) => row.id)
    .filter((id) => !pending.comments.has(id));
  if (reviews.length > 0) {
    db.update(schema.currentReviews)
      .set({ submitStatus: 'failed', submitError: REVIEW_SEND_STOPPED })
      .where(inArray(schema.currentReviews.id, reviews))
      .run();
  }
  if (replies.length > 0) {
    db.update(schema.reviewComments)
      .set({ replyStatus: 'draft', replyError: REPLY_SEND_STOPPED })
      .where(inArray(schema.reviewComments.id, replies))
      .run();
  }
  return { reviews: reviews.length, replies: replies.length };
}
