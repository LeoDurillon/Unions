// The Pull requests tab's read from GitHub: the pull requests and the repository's stacks together, and the current reviews' stacks kept up with it.
import { schema, type Db, type GitHubAuth } from '@union/core';
import type { GitHubStack } from '@union/core/github-stacks';
import { stackPlaces } from '@union/core/pr-stacks';
import { eq } from 'drizzle-orm';

import type { PullRequestFilter } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import type { RemotePullRequest } from '../github-pull-requests';
import { guarded } from './github-errors';

/** What one read finds: the newest pull requests of the filter, and the open stacks (null: none on GitHub). */
export type Listing = {
  total: number;
  pullRequests: RemotePullRequest[];
  stacks: GitHubStack[] | null;
};

/** Writes each current review's stack and place, where they changed. */
function keepReviewStacks(db: Db, projectId: number, stacks: GitHubStack[]): void {
  const places = stackPlaces(stacks);
  const reviews = db
    .select()
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.projectId, projectId))
    .all();
  for (const review of reviews) {
    const place = places.get(review.prNumber) ?? null;
    const number = place?.number ?? null;
    const position = place?.position ?? null;
    if (review.githubStackNumber !== number || review.stackPosition !== position) {
      db.update(schema.currentReviews)
        .set({ githubStackNumber: number, stackPosition: position })
        .where(eq(schema.currentReviews.id, review.id))
        .run();
    }
  }
}

/** Reads both at once; null when the repository is not reachable. */
export async function readListing(
  deps: { db: Db; github: OnboardingGitHub },
  project: { id: number; owner: string; repo: string },
  auth: GitHubAuth,
  filter: PullRequestFilter,
): Promise<Listing | null> {
  const repo = { owner: project.owner, repo: project.repo };
  const [found, stacks] = await Promise.all([
    guarded(() => deps.github.listPullRequests(auth, repo, filter)),
    guarded(() => deps.github.listStacks(auth, repo)),
  ]);
  if (!found) {
    return null;
  }
  if (stacks) {
    keepReviewStacks(deps.db, project.id, stacks);
  }
  return { ...found, stacks };
}
