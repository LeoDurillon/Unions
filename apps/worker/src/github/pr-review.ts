import { emitEvent, schema, type Db, type Project, type ReviewComment } from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';

import type { GitHubApi, ReviewLineComment } from './api';

type Review = typeof schema.currentReviews.$inferSelect;

function lineComment(draft: ReviewComment): ReviewLineComment {
  const side = draft.side === 'old' ? 'LEFT' : 'RIGHT';
  return {
    path: draft.path,
    body: draft.body,
    side,
    line: draft.endLine,
    ...(draft.startLine < draft.endLine ? { startLine: draft.startLine } : {}),
  };
}

function quoted(draft: ReviewComment): string {
  const lines =
    draft.startLine === draft.endLine
      ? `line ${draft.endLine}`
      : `lines ${draft.startLine}-${draft.endLine}`;
  return `**${draft.path}**, ${lines}${draft.side === 'old' ? ' (removed code)' : ''}:\n\n\`\`\`\n${draft.excerpt}\n\`\`\`\n\n${draft.body.trim()}`;
}

/**
 * The review as GitHub gets it. Drafts written on the commit the review is anchored at become line
 * comments; the others (the pull request moved on since) are quoted in the body with their code,
 * since GitHub refuses line comments outside the current diff. Comments on the whole pull request
 * follow the summary in the body.
 */
export function buildReview(
  review: Pick<Review, 'headSha'>,
  drafts: ReviewComment[],
  summary: string,
): { commitId: string | null; body: string; comments: ReviewLineComment[] } {
  const current = drafts.filter(
    (draft) => draft.kind === 'line' && draft.headSha === review.headSha,
  );
  const general = drafts.filter((draft) => draft.kind === 'general');
  const earlier = drafts.filter((draft) => draft.kind === 'line' && !current.includes(draft));
  const parts = summary.trim() === '' ? [] : [summary.trim()];
  parts.push(...general.map((draft) => draft.body.trim()));
  if (earlier.length > 0) {
    parts.push(
      '### On an earlier version of the pull request',
      ...earlier.map((draft) => quoted(draft)),
    );
  }
  return {
    commitId: review.headSha,
    body: parts.join('\n\n'),
    comments: current.map((draft) => lineComment(draft)),
  };
}

function load(db: Db, reviewId: number): { review: Review; project: Project } {
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, reviewId))
    .get();
  const project = review
    ? db.select().from(schema.projects).where(eq(schema.projects.id, review.projectId)).get()
    : undefined;
  if (!review || !project) {
    throw new Error(`Review ${reviewId} not found`);
  }
  return { review, project };
}

function pendingDrafts(db: Db, reviewId: number): ReviewComment[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(
      and(eq(schema.reviewComments.reviewId, reviewId), eq(schema.reviewComments.status, 'draft')),
    )
    .orderBy(schema.reviewComments.id)
    .all();
}

/** Only the drafts that were posted turn sent: one added while posting stays a draft. */
function finish(
  db: Db,
  review: Review,
  outcome: { url: string; posted: number[] } | { error: string },
): void {
  db.transaction((tx) => {
    if ('url' in outcome) {
      tx.update(schema.reviewComments)
        .set({ status: 'sent', sentAt: Date.now() })
        .where(inArray(schema.reviewComments.id, outcome.posted))
        .run();
    }
    tx.update(schema.currentReviews)
      .set({
        submitStatus: 'url' in outcome ? null : 'failed',
        submitError: 'url' in outcome ? null : outcome.error,
      })
      .where(eq(schema.currentReviews.id, review.id))
      .run();
    emitEvent(tx, {
      type: 'url' in outcome ? 'pr_review_posted' : 'pr_review_failed',
      payload: {
        reviewId: review.id,
        number: review.prNumber,
        ...('url' in outcome ? { url: outcome.url } : { error: outcome.error }),
      },
    });
  });
}

/**
 * Posts the review's drafts and summary on GitHub as one "Comment" review, then marks the drafts
 * sent. A failure is kept on the review (`submit_status` failed) and the drafts stay drafts.
 */
export async function postPullRequestReview(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  reviewId: number,
  summary: string,
): Promise<void> {
  const { review, project } = load(db, reviewId);
  try {
    const api = apiFor(project);
    if (!api) {
      throw new Error('This project has no GitHub credentials');
    }
    const repo = { owner: project.owner, repo: project.repo };
    const posted = pendingDrafts(db, review.id);
    const url = await api.createPullRequestReview(
      repo,
      review.prNumber,
      buildReview(review, posted, summary),
    );
    finish(db, review, { url, posted: posted.map((draft) => draft.id) });
  } catch (error) {
    finish(db, review, { error: error instanceof Error ? error.message : String(error) });
  }
}
