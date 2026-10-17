// Builds the web server's Hono app: error handling and the API routes, wired to the database and GitHub.
import { FetchNotionApi, type Db, type NotionApi } from '@union/core';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { OctokitCi, type CiGitHub } from './github-checks';
import { OctokitOnboarding, type OnboardingGitHub } from './github-onboarding';
import { INTERNAL_ERROR } from './http';
import { apiRoutes } from './routes/api';

/** Someone waits on the page: a GitHub call gives up after about 40 s (two 20 s attempts), not 2 minutes. */
const WEB_GITHUB_LIMITS = { timeoutMs: 20_000, retries: 1 };

function toErrorResponse(failure: Error, c: Context): Response {
  if (failure instanceof HTTPException) {
    return c.json({ error: failure.message }, failure.status);
  }
  return c.json({ error: failure.message }, INTERNAL_ERROR);
}

export function createApp(
  db: Db,
  github: OnboardingGitHub = new OctokitOnboarding(WEB_GITHUB_LIMITS),
  notion: NotionApi = new FetchNotionApi(),
  ci: CiGitHub = new OctokitCi(WEB_GITHUB_LIMITS),
): Hono {
  const app = new Hono();
  app.route('/api', apiRoutes(db, { github, notion, ci }));
  app.onError(toErrorResponse);
  return app;
}
