// The routes under a pull request under review that act on its own checkout or links: preview, commands, Notion page.
import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { load } from './pr-review-load';
import { reviewNotionRoutes } from './review-notion';
import { notionSuggestions } from './review-notion-suggestions';
import { reviewPreviewRoutes } from './review-preview';
import { reviewRunRoutes } from './review-runs';

/** Under `/api/projects/:projectId/pull-requests/reviews/:number`: `/preview`, `/runs`, `/notion` and its suggestions. */
export function reviewWorkspaceRoutes(
  db: Db,
  { github, notion }: { github: OnboardingGitHub; notion: NotionApi },
): Hono {
  const routes = new Hono();
  routes.route('/preview', reviewPreviewRoutes(db));
  routes.route('/runs', reviewRunRoutes(db));
  routes.get('/notion/suggestions', (c) =>
    notionSuggestions(c, { db, github, notion }, load(db, c)),
  );
  routes.route('/notion', reviewNotionRoutes(db, notion));
  return routes;
}
