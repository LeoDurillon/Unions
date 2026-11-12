// `/api/projects/:projectId/github-project`: the GitHub Projects the board can mirror to, and
// connecting one. One is picked or created to connect; it can also be disconnected.
import { parseProjectUrl, type Db } from '@union/core';
import { Hono, type Context } from 'hono';

import type { ProjectOption } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { setGitHubProject } from '../github-project-link';
import { BAD_REQUEST, CONFLICT, fail, optionalText, readObject } from '../http';
import { publicProjectOf } from '../public-project';
import { guarded } from './github-errors';
import { projectOf, projectWithAuth } from './rule-choices';

/** A Project picked from the list (its node id and URL), or a new one by title, created on GitHub here as the wizard does. */
async function chosenBoard(
  db: Db,
  github: OnboardingGitHub,
  c: Context,
): Promise<{ nodeId: string; url: string }> {
  const { project, auth } = projectWithAuth(db, c);
  const body = await readObject(c.req.raw);
  const title = optionalText(body, 'title');
  if (title) {
    const repo = { owner: project.owner, repo: project.repo };
    const ids = await guarded(() => github.repositoryIds(auth, repo));
    if (!ids) {
      throw fail(CONFLICT, `${project.owner}/${project.repo} is not reachable`);
    }
    const created: ProjectOption = await guarded(() =>
      github.createProject(auth, { ...ids, title }),
    );
    return { nodeId: created.id, url: created.url };
  }
  const nodeId = optionalText(body, 'nodeId');
  const url = optionalText(body, 'url');
  if (!nodeId || !url || !parseProjectUrl(url)) {
    throw fail(BAD_REQUEST, 'Give a new Project’s "title", or the "nodeId" and "url" of one');
  }
  return { nodeId, url };
}

export function githubProjectLinkRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:projectId/github-project/choices', async (c) => {
    const { project, auth } = projectWithAuth(db, c);
    return c.json(await guarded(() => github.listProjects(auth, project.owner)));
  });
  routes.put('/:projectId/github-project', async (c) => {
    const board = await chosenBoard(db, github, c);
    return c.json(publicProjectOf(db, setGitHubProject(db, projectOf(db, c), board)));
  });
  routes.delete('/:projectId/github-project', (c) =>
    c.json(publicProjectOf(db, setGitHubProject(db, projectOf(db, c), null))),
  );
  return routes;
}
