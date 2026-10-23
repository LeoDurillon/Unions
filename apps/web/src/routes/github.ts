// The wizard's GitHub reads; each request carries a `token` or an app `installationId`.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { requestAuth } from '../github-credentials';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, fail, readObject, requireText } from '../http';
import { githubAppRoutes } from './github-app';
import { guarded } from './github-errors';

function pageOf(value: unknown): number {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    throw fail(BAD_REQUEST, '"page" must be a positive integer');
  }
  return page;
}

/**
 * The wizard's GitHub reads; each request carries a `token` or an app `installationId`. `/app`
 * manages the GitHub App itself.
 */
export function githubRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();

  routes.post('/verify', async (c) => {
    const body = await readObject(c.req.raw);
    const auth = requestAuth(db, body);
    return c.json(await guarded(() => github.verify(auth)));
  });

  routes.post('/repos', async (c) => {
    const body = await readObject(c.req.raw);
    const auth = requestAuth(db, body);
    return c.json(await guarded(() => github.listRepos(auth, pageOf(body.page))));
  });

  routes.post('/projects', async (c) => {
    const body = await readObject(c.req.raw);
    const auth = requestAuth(db, body);
    const owner = requireText(body, 'owner');
    return c.json(await guarded(() => github.listProjects(auth, owner)));
  });

  routes.post('/create-project', async (c) => {
    const body = await readObject(c.req.raw);
    const auth = requestAuth(db, body);
    const input = {
      ownerId: requireText(body, 'ownerId'),
      repositoryId: requireText(body, 'repositoryId'),
      title: requireText(body, 'title'),
    };
    return c.json(await guarded(() => github.createProject(auth, input)));
  });

  routes.route('/app', githubAppRoutes(db, github));

  return routes;
}
