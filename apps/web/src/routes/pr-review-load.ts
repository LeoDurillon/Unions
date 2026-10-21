// Loads the review and project a pull request route refers to, the GitHub auth to act on them, and the review's files and stack from GitHub.
import { projectGitHubAuth, schema, type Db } from '@union/core';
import type { GitHubStack } from '@union/core/github-stacks';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import type { PullRequestFiles } from '../github-pull-request-files';
import { CONFLICT, fail, NOT_FOUND, requireId } from '../http';
import { guarded } from './github-errors';

export type Review = typeof schema.currentReviews.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;

export function load(db: Db, c: Context): { review: Review; project: Project } {
  const projectId = requireId(c.req.param('projectId'), 'project id');
  const number = requireId(c.req.param('number'), 'pull request number');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, projectId),
        eq(schema.currentReviews.prNumber, number),
      ),
    )
    .get();
  if (!project || !review) {
    throw fail(NOT_FOUND, `#${number} is not among the current reviews`);
  }
  return { review, project };
}

export function authOf(
  db: Db,
  project: Project,
): NonNullable<ReturnType<typeof projectGitHubAuth>> {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  return auth;
}

function stackPositionOf(stack: GitHubStack, number: number): number {
  return stack.pullRequests.findIndex((pull) => pull.number === number);
}

/**
 * The pull request's files, branches and GitHub stack read again: GitHub retargets a pull request
 * whose base branch is deleted, and a stack changes on GitHub.
 */
export async function readReviewFiles(
  db: Db,
  github: OnboardingGitHub,
  project: Project,
  review: Review,
): Promise<PullRequestFiles> {
  const repo = { owner: project.owner, repo: project.repo };
  const auth = authOf(db, project);
  const [fetched, stack] = await Promise.all([
    guarded(() => github.getPullRequestFiles(auth, repo, review.prNumber)),
    guarded(() => github.pullRequestStack(auth, repo, review.prNumber)),
  ]);
  if (!fetched) {
    throw fail(
      NOT_FOUND,
      `${project.owner}/${project.repo} has no pull request #${review.prNumber}`,
    );
  }
  db.update(schema.currentReviews)
    .set({
      files: fetched.files,
      headSha: fetched.headSha,
      headBranch: fetched.headBranch,
      baseBranch: fetched.baseBranch,
      githubStackNumber: stack?.open === true ? stack.number : null,
      stackPosition: stack?.open === true ? stackPositionOf(stack, review.prNumber) : null,
    })
    .where(eq(schema.currentReviews.id, review.id))
    .run();
  return fetched;
}
