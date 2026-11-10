// Posts a review's drafts and summary on GitHub as one pull request review, with the user's
// verdict.
import {
  emitEvent,
  rangeInDiff,
  schema,
  type Db,
  type Project,
  type ReviewComment,
  type ReviewVerdict,
} from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';

import type { GitHubApi, PullRequestReview, ReviewLineComment } from './api';

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
 * Whether GitHub takes the draft as a line comment: all its lines in one hunk of the file's patch as
 * last fetched. Without the files fetched, the draft is trusted, as it was checked when written.
 */
function inDiff(review: Pick<Review, 'files'>, draft: ReviewComment): boolean {
  if (!review.files) {
    return true;
  }
  const patch = review.files.find((file) => file.path === draft.path)?.patch;
  const span =
    patch === undefined ? null : rangeInDiff(patch, draft.side, draft.startLine, draft.endLine);
  return span?.startLine === draft.startLine && span.endLine === draft.endLine;
}

function section(title: string, drafts: ReviewComment[]): string[] {
  return drafts.length === 0 ? [] : [title, ...drafts.map((draft) => quoted(draft))];
}

/**
 * The review as GitHub gets it. Drafts written on the commit the review is anchored at, on lines of
 * its diff, become line comments; the others (the pull request moved on since, or lines outside the
 * diff) are quoted in the body with their code, since GitHub refuses the whole review for one line
 * comment outside the diff. Comments on the whole pull request follow the summary in the body.
 */
function buildReview(
  review: Pick<Review, 'headSha' | 'files'>,
  drafts: ReviewComment[],
  summary: string,
  verdict: ReviewVerdict,
): PullRequestReview {
  const lines = drafts.filter((draft) => draft.kind === 'line');
  const onHead = lines.filter((draft) => draft.headSha === review.headSha);
  const current = onHead.filter((draft) => inDiff(review, draft));
  const outside = onHead.filter((draft) => !current.includes(draft));
  const earlier = lines.filter((draft) => !onHead.includes(draft));
  const general = drafts.filter((draft) => draft.kind === 'general');
  const parts = summary.trim() === '' ? [] : [summary.trim()];
  parts.push(
    ...general.map((draft) => draft.body.trim()),
    ...section('### Outside the diff', outside),
    ...section('### On an earlier version of the pull request', earlier),
  );
  return {
    commitId: review.headSha,
    body: parts.join('\n\n'),
    comments: current.map((draft) => lineComment(draft)),
    verdict,
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
/** The ticket whose pull request this is, so its rules and log see the review. */
function ticketOf(db: Db, review: Review): number | undefined {
  return db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.projectId, review.projectId),
        eq(schema.tickets.prNumber, review.prNumber),
      ),
    )
    .get()?.id;
}

function finish(
  db: Db,
  review: Review,
  verdict: ReviewVerdict,
  outcome: { url: string; posted: number[] } | { error: string },
): void {
  const ticketId = ticketOf(db, review);
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
    const posted = { reviewId: review.id, number: review.prNumber };
    emitEvent(
      tx,
      'url' in outcome
        ? { type: 'pr_review_posted', ticketId, payload: { ...posted, url: outcome.url, verdict } }
        : { type: 'pr_review_failed', ticketId, payload: { ...posted, error: outcome.error } },
    );
  });
}

/**
 * Posts the review's drafts and summary on GitHub as one review with the user's verdict, then marks
 * the drafts sent. A failure is kept on the review (`submit_status` failed) and the drafts stay drafts.
 */
export async function postPullRequestReview(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  reviewId: number,
  submitted: { summary: string; verdict: ReviewVerdict },
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
      buildReview(review, posted, submitted.summary, submitted.verdict),
    );
    finish(db, review, submitted.verdict, { url, posted: posted.map((draft) => draft.id) });
  } catch (error) {
    finish(db, review, submitted.verdict, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
