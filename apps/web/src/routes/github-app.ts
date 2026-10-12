import { deleteGitHubApp, getGitHubApp, saveGitHubApp, schema, type Db } from '@union/core';
import { isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';

import type { GitHubAppStatus } from '../api-types';
import { requireApp } from '../github-credentials';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, readObject, requireText } from '../http';
import { guarded } from './github-errors';

function statusOf(db: Db): GitHubAppStatus {
  const app = getGitHubApp(db);
  return app
    ? {
        configured: true,
        appId: app.appId,
        slug: app.slug,
        name: app.name,
        url: `https://github.com/apps/${app.slug}`,
      }
    : { configured: false };
}

/** A PEM as GitHub downloads it; anything else would fail later with an obscure error. */
function requirePrivateKey(body: Record<string, unknown>): string {
  const key = requireText(body, 'privateKey');
  if (!/^-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(key)) {
    throw fail(BAD_REQUEST, 'The private key must be the .pem file GitHub generated for the app');
  }
  return `${key}\n`;
}

/** The global GitHub App: its credentials are checked against GitHub before they are stored. */
export function githubAppRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(statusOf(db)));

  routes.put('/', async (c) => {
    const body = await readObject(c.req.raw);
    const credentials = { appId: requireText(body, 'appId'), privateKey: requirePrivateKey(body) };
    const info = await guarded(() => github.verifyApp(credentials));
    saveGitHubApp(db, { ...credentials, slug: info.slug, name: info.name });
    return c.json(statusOf(db));
  });

  routes.delete('/', (c) => {
    const users = db
      .select()
      .from(schema.projects)
      .where(isNotNull(schema.projects.githubInstallationId))
      .all();
    if (users.length > 0) {
      const names = users.map((project) => `${project.owner}/${project.repo}`).join(', ');
      throw fail(CONFLICT, `Still used by ${names}: give them a token first`);
    }
    deleteGitHubApp(db);
    return c.json(statusOf(db));
  });

  routes.get('/installations', async (c) => {
    const app = requireApp(db);
    return c.json(await guarded(() => github.listInstallations(app)));
  });

  return routes;
}
