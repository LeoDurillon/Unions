import { parseProjectUrl, schema, type Db } from '@union/core';
import { Hono } from 'hono';

import { toPublicProject } from '../api-types';
import { optionalInstallationId, requireApp } from '../github-credentials';
import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  optionalText,
  readObject,
  requireText,
} from '../http';
import { investigationRoutes } from './investigations';
import { requireNotionId } from './notion';
import { deleteProject, updateProject } from './project-settings';

const DEFAULT_BRANCH = 'main';

/** Optional at creation: both Notion fields or neither. */
function notionDataSourceOf(body: Record<string, unknown>): string | undefined {
  const token = optionalText(body, 'notionToken');
  const source = optionalText(body, 'notionDataSourceId');
  if (Boolean(token) !== Boolean(source)) {
    throw fail(BAD_REQUEST, 'Give both the Notion token and the data source ID, or neither');
  }
  return source ? requireNotionId(body, 'notionDataSourceId', 'data source') : undefined;
}

/** A GitHub App installation or a token (or neither: the worker falls back to `GITHUB_TOKEN`). */
function credentialsOf(
  db: Db,
  body: Record<string, unknown>,
): { githubToken: string | null; githubInstallationId: number | null } {
  const installationId = optionalInstallationId(body);
  if (installationId !== undefined) {
    requireApp(db);
    return { githubToken: null, githubInstallationId: installationId };
  }
  return { githubToken: optionalText(body, 'token') ?? null, githubInstallationId: null };
}

export function projectRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/', (c) =>
    c.json(
      db
        .select()
        .from(schema.projects)
        .all()
        .map((project) => toPublicProject(project)),
    ),
  );

  routes.post('/', async (c) => {
    const body = await readObject(c.req.raw);
    const owner = requireText(body, 'owner');
    const repo = requireText(body, 'repo');
    const projectUrl = optionalText(body, 'projectUrl');
    const nodeId = optionalText(body, 'githubProjectNodeId');
    if (!projectUrl && !nodeId) {
      throw fail(BAD_REQUEST, 'Give a GitHub Project URL or a project node id');
    }
    if (projectUrl && !parseProjectUrl(projectUrl)) {
      throw fail(
        BAD_REQUEST,
        'Project URL must look like https://github.com/orgs/<org>/projects/<n>',
      );
    }
    const duplicate = db
      .select()
      .from(schema.projects)
      .all()
      .some((row) => row.owner === owner && row.repo === repo);
    if (duplicate) {
      throw fail(CONFLICT, `${owner}/${repo} is already set up`);
    }
    const project = db
      .insert(schema.projects)
      .values({
        owner,
        repo,
        githubProjectUrl: projectUrl ?? null,
        githubProjectNodeId: nodeId ?? '',
        ...credentialsOf(db, body),
        notionToken: optionalText(body, 'notionToken') ?? null,
        config: {
          baseBranch: optionalText(body, 'baseBranch') ?? DEFAULT_BRANCH,
          notionDataSourceId: notionDataSourceOf(body),
        },
      })
      .returning()
      .get();
    return c.json(toPublicProject(project), CREATED);
  });

  routes.patch('/:id', (c) => updateProject(db, c));
  routes.delete('/:id', (c) => deleteProject(db, c));
  routes.route('/:projectId/investigations', investigationRoutes(db));

  return routes;
}
