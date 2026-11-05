// Builds the web server's Hono app: error handling and the API routes, wired to the database and GitHub.
import { FetchNotionApi, type Db, type NotionApi } from '@union/core';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { OctokitCi, type CiGitHub } from './github-checks';
import { OctokitOnboarding, type OnboardingGitHub } from './github-onboarding';
import { OctokitRepository, type RepositoryGitHub } from './github-repository';
import { INTERNAL_ERROR } from './http';
import { CachedRepository } from './repository-cache';
import { apiRoutes } from './routes/api';

/**
 * Someone waits on the page: a GitHub call gives up after about 40 s (two 20 s attempts), not 2
 * minutes, and after 45 s whatever held it up. The web only reads, so it skips Octokit's throttling,
 * whose process-wide queues once left every GitHub read of the page waiting until a restart.
 */
const WEB_GITHUB_LIMITS = { timeoutMs: 20_000, retries: 1, deadlineMs: 45_000, throttled: false };

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
  more: { ci?: CiGitHub; repository?: RepositoryGitHub } = {},
): Hono {
  const ci = more.ci ?? new OctokitCi(WEB_GITHUB_LIMITS);
  const repository =
    more.repository ?? new CachedRepository(new OctokitRepository(WEB_GITHUB_LIMITS));
  const app = new Hono();
  app.route('/api', apiRoutes(db, { github, notion, ci, repository }));
  app.onError(toErrorResponse);
  return app;
}
