import type { Db } from '@union/core';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { OctokitOnboarding, type OnboardingGitHub } from './github-onboarding';
import { INTERNAL_ERROR } from './http';
import { FetchNotionApi, type NotionApi } from './notion';
import { apiRoutes } from './routes/api';

function toErrorResponse(failure: Error, c: Context): Response {
  if (failure instanceof HTTPException) {
    return c.json({ error: failure.message }, failure.status);
  }
  return c.json({ error: failure.message }, INTERNAL_ERROR);
}

export function createApp(
  db: Db,
  github: OnboardingGitHub = new OctokitOnboarding(),
  notion: NotionApi = new FetchNotionApi(),
): Hono {
  const app = new Hono();
  app.route('/api', apiRoutes(db, github, notion));
  app.onError(toErrorResponse);
  return app;
}
