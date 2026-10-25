// The routes under a pull request under review about its own checkout, commits and links: preview,
// commands, commits, replies to its comments, Notion pages.
import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { reviewReplyRoutes } from './pr-comment-replies';
import { prCommitRoutes } from './pr-commits';
import { load } from './pr-review-load';
import { reviewNotionRoutes } from './review-notion';
import { notionSuggestions } from './review-notion-suggestions';
import { reviewPreviewRoutes } from './review-preview';
import { reviewRunRoutes } from './review-runs';

/** Under `/api/projects/:projectId/pull-requests/reviews/:number`: `/commits`, `/preview`, `/runs`, `/replies`, `/notion` and its suggestions. */
export function reviewWorkspaceRoutes(
  db: Db,
  { github, notion }: { github: OnboardingGitHub; notion: NotionApi },
): Hono {
  const routes = new Hono();
  routes.route('/commits', prCommitRoutes(db, github));
  routes.route('/preview', reviewPreviewRoutes(db));
  routes.route('/runs', reviewRunRoutes(db));
  routes.route('/replies', reviewReplyRoutes(db));
  routes.get('/notion/suggestions', (c) =>
    notionSuggestions(c, { db, github, notion }, load(db, c)),
  );
  routes.route('/notion', reviewNotionRoutes(db, notion));
  return routes;
}
