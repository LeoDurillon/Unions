// A pull request's own container (`union-r<id>`): its checkout at the reviewed commit, for its preview, tests and commands.
import { schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { loadProject, type TargetDeps } from './agent-review-target';
import { projectGitToken } from './credentials';
import { clonePullRequest } from './pr-checkout';
import { cloneSource, hostGit, type TicketContainer } from './provision';

export type Review = typeof schema.currentReviews.$inferSelect;

export function reviewContainerNames(reviewId: number): TicketContainer {
  return {
    name: `union-r${reviewId}`,
    homeVolume: `union-r${reviewId}-home`,
    workspaceVolume: `union-r${reviewId}-ws`,
  };
}

export function loadReview(db: Db, reviewId: number): Review {
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, reviewId))
    .get();
  if (!review) {
    throw new Error(`Review ${reviewId} not found`);
  }
  return review;
}

/**
 * Whether `sha` is on `branch` of the repository itself: pushed by someone who can write to it, not
 * only in a fork. False when the branch is not there (a fork's) or no longer holds the commit.
 */
async function onRepositoryBranch(
  dir: string,
  branch: string,
  sha: string,
  secret: string | null,
): Promise<boolean> {
  try {
    await hostGit(['-C', dir, 'fetch', '--quiet', 'origin', `refs/heads/${branch}`], secret);
    await hostGit(['-C', dir, 'merge-base', '--is-ancestor', sha, 'FETCH_HEAD'], secret);
    return true;
  } catch {
    return false;
  }
}

/** Copies the pull request in, at the commit its files were read at, into a running container. */
async function checkOut(deps: TargetDeps, review: Review, names: TicketContainer): Promise<void> {
  const { db, runtime, config } = deps;
  const { headSha } = review;
  if (!headSha) {
    throw new Error("Open the pull request's review first: its files are not read yet");
  }
  const project = loadProject(db, review.projectId);
  const source = cloneSource(
    config.gitBaseUrl,
    project.owner,
    project.repo,
    await projectGitToken(db, project),
  );
  let inRepo = false;
  await clonePullRequest(runtime, names.name, source, {
    base: review.baseBranch,
    number: review.prNumber,
    headSha,
    inspect: async (dir) => {
      inRepo = await onRepositoryBranch(dir, review.headBranch, headSha, source.secret);
    },
  });
  db.update(schema.currentReviews)
    .set({ checkoutSha: headSha, checkoutInRepo: inRepo })
    .where(eq(schema.currentReviews.id, review.id))
    .run();
}

/**
 * Runs `work` with the review's container running, and stops it after: nothing lives in it between
 * the preview's starts, the tests and the commands.
 */
async function whileRunning(
  deps: TargetDeps,
  names: TicketContainer,
  work: () => Promise<void>,
): Promise<void> {
  await deps.runtime.create({ ...names, image: deps.config.image });
  if (!(await deps.runtime.isRunning(names.name))) {
    await deps.runtime.start(names.name);
  }
  try {
    await work();
  } finally {
    await deps.runtime.stop(names.name);
  }
}

/**
 * The review's container, with the pull request checked out the first time (idempotent). It never
 * gets the Claude credential, nor a GitHub token: nothing runs `claude` in it, and its `origin` has none.
 */
export async function ensureReviewCheckout(
  deps: TargetDeps,
  reviewId: number,
): Promise<TicketContainer> {
  const names = reviewContainerNames(reviewId);
  const review = loadReview(deps.db, reviewId);
  if (review.checkoutSha === null) {
    await whileRunning(deps, names, () => checkOut(deps, review, names));
  }
  return names;
}

/**
 * Checks the review's newer commit out in place of the old one, once `clear` emptied the repository
 * folder (what a command or a service wrote there goes with it). The caller takes the preview down
 * first: its services mount that folder.
 */
export async function updateReviewCheckout(
  deps: TargetDeps,
  reviewId: number,
  clear: (workspaceVolume: string) => Promise<void>,
): Promise<void> {
  const names = reviewContainerNames(reviewId);
  const review = loadReview(deps.db, reviewId);
  await whileRunning(deps, names, async () => {
    await clear(names.workspaceVolume);
    await checkOut(deps, review, names);
  });
}
