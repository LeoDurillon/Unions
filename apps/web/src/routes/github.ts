import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, fail, readObject, requireText } from '../http';

const UNAUTHORIZED = 401;
const BAD_GATEWAY = 502;

function statusOf(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null;
}

/** Turns GitHub failures into messages the wizard can show next to the field. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    if (statusOf(error) === UNAUTHORIZED) {
      throw fail(UNAUTHORIZED, 'GitHub rejected this token (bad credentials or expired).');
    }
    const message = error instanceof Error ? error.message : 'GitHub request failed';
    throw fail(BAD_GATEWAY, message);
  }
}

function pageOf(value: unknown): number {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    throw fail(BAD_REQUEST, '"page" must be a positive integer');
  }
  return page;
}

export function githubRoutes(github: OnboardingGitHub): Hono {
  const routes = new Hono();

  routes.post('/verify', async (c) => {
    const body = await readObject(c.req.raw);
    return c.json(await guarded(() => github.verify(requireText(body, 'token'))));
  });

  routes.post('/repos', async (c) => {
    const body = await readObject(c.req.raw);
    const token = requireText(body, 'token');
    return c.json(await guarded(() => github.listRepos(token, pageOf(body.page))));
  });

  routes.post('/projects', async (c) => {
    const body = await readObject(c.req.raw);
    const token = requireText(body, 'token');
    const owner = requireText(body, 'owner');
    return c.json(await guarded(() => github.listProjects(token, owner)));
  });

  routes.post('/create-project', async (c) => {
    const body = await readObject(c.req.raw);
    const token = requireText(body, 'token');
    const input = {
      ownerId: requireText(body, 'ownerId'),
      repositoryId: requireText(body, 'repositoryId'),
      title: requireText(body, 'title'),
    };
    return c.json(await guarded(() => github.createProject(token, input)));
  });

  return routes;
}
