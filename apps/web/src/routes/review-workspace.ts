// The routes under a pull request under review about its own checkout, commits and links: preview,
// commands, commits, replies to its comments, Notion pages, Jira issues.
import type { Db, JiraApi, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { reviewReplyRoutes } from './pr-comment-replies';
import { prCommitRoutes } from './pr-commits';
import { reviewPreviewRoutes } from './review-preview';
import { reviewRunRoutes } from './review-runs';
import { reviewTrackerRoutes } from './review-trackers';

/** Under `/api/projects/:projectId/pull-requests/reviews/:number`: `/commits`, `/preview`, `/runs`, `/replies`, `/notion` and its suggestions, `/jira`. */
export function reviewWorkspaceRoutes(
  db: Db,
  { github, notion, jira }: { github: OnboardingGitHub; notion: NotionApi; jira: JiraApi },
): Hono {
  const routes = new Hono();
  routes.route('/commits', prCommitRoutes(db, github));
  routes.route('/preview', reviewPreviewRoutes(db));
  routes.route('/runs', reviewRunRoutes(db));
  routes.route('/replies', reviewReplyRoutes(db));
  routes.route('/', reviewTrackerRoutes(db, { github, notion, jira }));
  return routes;
}
