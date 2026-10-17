// A stack's agent review: its pull requests checked out together, the prompt that lists them, and the findings split per pull request.
import {
  resolveAgent,
  schema,
  sharedPrompt,
  specsSection,
  type AgentDraft,
  type AgentReviewOutcome,
  type AgentReviewSpec,
  type Db,
} from '@union/core';
import { inArray } from 'drizzle-orm';

import { STACK_FINDINGS_FORMAT, toDrafts, type Findings } from './agent-review-findings';
import { loadProject, patches, throwawayCheckout, type TargetDeps } from './agent-review-target';
import { clonePullRequests, pullRef } from './pr-checkout';
import type { TicketContainer } from './provision';

/** A pull request of the stack as the agent compares it: its own change is `base...ref`. */
export type StackMember = {
  reviewId: number;
  prNumber: number;
  title: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  ref: string;
  base: string;
  patchOf: (path: string) => string | undefined;
};

export type StackTarget = {
  container: string;
  projectId: number;
  /** Bottom first. */
  members: StackMember[];
  close: () => Promise<void>;
};

type Review = typeof schema.currentReviews.$inferSelect;

/** Each review as a member; a pull request on another of the stack is compared with that one. */
function membersOf(reviews: Review[]): StackMember[] {
  return reviews.map((review) => {
    const { files, headSha } = review;
    if (!files || !headSha) {
      throw new Error(`Open the review of #${review.prNumber} first: its files are not read yet`);
    }
    const parent = reviews.find((other) => other.headBranch === review.baseBranch);
    return {
      reviewId: review.id,
      prNumber: review.prNumber,
      title: review.title,
      author: review.author,
      headBranch: review.headBranch,
      baseBranch: review.baseBranch,
      headSha,
      ref: pullRef(review.prNumber),
      base: parent ? pullRef(parent.prNumber) : `origin/${review.baseBranch}`,
      patchOf: patches(files),
    };
  });
}

/** The stack's reviews (`reviewIds`, bottom first) checked out in a throwaway container, the top one at HEAD. */
export async function openStackTarget(
  deps: TargetDeps,
  reviewIds: number[],
  names: TicketContainer,
): Promise<StackTarget> {
  const rows = deps.db
    .select()
    .from(schema.currentReviews)
    .where(inArray(schema.currentReviews.id, reviewIds))
    .all();
  const reviews = reviewIds.flatMap((id) => rows.filter((row) => row.id === id));
  const members = membersOf(reviews);
  const [bottom] = reviews;
  if (!bottom || members.length !== reviewIds.length) {
    throw new Error('A pull request of the stack is no longer under review');
  }
  const project = loadProject(deps.db, bottom.projectId);
  const close = await throwawayCheckout(deps, project, names, (source) =>
    clonePullRequests(deps.runtime, names.name, source, {
      base: bottom.baseBranch,
      pulls: members.map((member) => ({ number: member.prNumber, headSha: member.headSha })),
    }),
  );
  return { container: names.name, projectId: project.id, members, close };
}

function memberLine(member: StackMember, position: number, specs: AgentReviewSpec[]): string {
  const linked = specs.flatMap((spec, index) =>
    spec.prs.includes(member.prNumber) ? [index + 1] : [],
  );
  const specLine =
    specs.length === 0 ? '' : ` Its specs: ${linked.length > 0 ? linked.join(', ') : 'none'}.`;
  return `${position}. #${member.prNumber} by ${member.author}: ${member.title} (\`${member.headBranch}\` into \`${member.baseBranch}\`). Its own change: \`git diff ${member.base}...${member.ref}\`; its commits: \`git log ${member.base}..${member.ref}\`.${specLine}`;
}

export function stackReviewPrompt(
  db: Db,
  target: StackTarget,
  specs: AgentReviewSpec[] | null,
): string {
  const given = specs ?? [];
  const lines = target.members.map((member, index) => memberLine(member, index + 1, given));
  const specText = specsSection(given);
  const unimplemented = given.length > 0 ? 'a part of a spec no pull request implements, ' : '';
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_comments').prompt}

## What you review

A stack of ${target.members.length} pull requests, each built on the one before it, bottom first:

${lines.join('\n')}

The top one is checked out at HEAD: read any file you need, and \`git show <ref>:<path>\` for a file as a lower pull request leaves it. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

Review each pull request on its own change${given.length > 0 ? ' and against its specs' : ''}, then the stack as a whole: a pull request that breaks or undoes what one below it adds, work done twice, ${unimplemented}a pull request that cannot build or pass its tests without the ones above it.
${specText === '' ? '' : `\n${specText}\n`}
## Your answer

${STACK_FINDINGS_FORMAT}`;
}

/** No diff to place stray comments on: they become general comments. */
const NO_PATCHES = new Map<string, string>();

const UNTIED = 'Not tied to a pull request';

/**
 * Comments without a pull request of the stack: kept on the top one as general comments, labelled
 * so the user moves or drops them before posting.
 */
function strayDrafts(findings: Findings, numbers: Set<number>): AgentDraft[] {
  const strays = findings.comments.filter(
    (comment) => comment.pr === null || !numbers.has(comment.pr),
  );
  const drafts = toDrafts({ summary: '', comments: strays }, (path) => NO_PATCHES.get(path));
  for (const [index, draft] of drafts.entries()) {
    const pr = strays[index]?.pr ?? null;
    const label = pr === null ? UNTIED : `${UNTIED} of the stack (the agent named #${pr})`;
    draft.body = `${label}: ${draft.body}`;
  }
  return drafts;
}

/**
 * The findings as drafts on each pull request: a comment on its lines where its diff has them; the
 * summary and the comments on no pull request of the stack go to the top one.
 */
export function stackOutcome(findings: Findings, members: StackMember[]): AgentReviewOutcome {
  const numbers = new Set(members.map((member) => member.prNumber));
  const top = members.at(-1);
  const draftsOf = (member: StackMember): AgentDraft[] => {
    const comments = findings.comments.filter((comment) => comment.pr === member.prNumber);
    const own = toDrafts(
      { summary: member === top ? findings.summary : '', comments },
      member.patchOf,
    );
    return member === top ? [...own, ...strayDrafts(findings, numbers)] : own;
  };
  const [bottom, ...rest] = members;
  if (!bottom) {
    return { status: 'failed', error: 'The stack has no pull request' };
  }
  return {
    status: 'succeeded',
    headSha: bottom.headSha,
    drafts: draftsOf(bottom),
    others: rest.map((member) => ({
      reviewId: member.reviewId,
      headSha: member.headSha,
      drafts: draftsOf(member),
    })),
  };
}
