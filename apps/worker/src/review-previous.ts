// What a final review is told of the one before it: its findings, the feedback sent since, and the commits since.
import { schema, type Db } from '@union/core';
import { asc, eq } from 'drizzle-orm';

export type PreviousReview = {
  content: string;
  /** The commit it read; null for a review saved before it was recorded. */
  headSha: string | null;
  /** What the user sent the implementer after it, oldest first. */
  feedback: string[];
};

/** Where the commit the earlier review read stands in the branch now. */
export type ReviewedCommit = 'in_history' | 'rewritten' | 'unknown';

function present(text: string | null): text is string {
  return text !== null && text.trim() !== '';
}

/** The ticket's latest final review, with the feedback on it and on the implementation runs after it. */
export function previousReview(db: Db, ticketId: number): PreviousReview | null {
  const outputs = db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .orderBy(asc(schema.stepOutputs.id))
    .all();
  const review = outputs.findLast((output) => output.step === 'final_review');
  if (!review) {
    return null;
  }
  const later = outputs
    .slice(outputs.indexOf(review) + 1)
    .filter((output) => output.step === 'implement')
    .map((output) => output.feedback);
  return {
    content: review.content,
    headSha: review.headSha,
    feedback: [review.feedback, ...later].filter((text) => present(text)),
  };
}

function sinceText(sha: string | null, reviewed: ReviewedCommit): string {
  if (sha === null || reviewed === 'unknown') {
    return 'The commit it read was not recorded: compare the branch with the base as usual.';
  }
  if (reviewed === 'rewritten') {
    return `It read commit \`${sha}\`, which is no longer in the branch's history (the branch was rebased or its commits rewritten): compare the branch with the base as usual.`;
  }
  return `It read commit \`${sha}\`. What changed since: \`git diff ${sha}..HEAD\` and \`git log ${sha}..HEAD\`. Read the diff from the base only where you need the context.`;
}

/** Appended to the review's instructions when the branch was reviewed before. */
export function previousReviewSection(previous: PreviousReview, reviewed: ReviewedCommit): string {
  const feedback =
    previous.feedback.length > 0
      ? previous.feedback.join('\n\n---\n\n')
      : 'Nothing: the review is run again without changes requested.';
  return `# Your earlier review

You reviewed this branch before. Your review:

${previous.content}

## What the user sent the implementer since

${feedback}

## What changed since

${sinceText(previous.headSha, reviewed)}

## How to review again

Start with the verdict line as usual. Then, for each finding of your earlier review, say in one line whether it is fixed, still open, or dropped because the user's feedback decided otherwise. Then list new findings: problems in the commits since, and problems the earlier review missed only when they break an acceptance criterion or are bugs. Request changes only for findings still open or new blocking ones, and never raise again a point the user declined.`;
}
