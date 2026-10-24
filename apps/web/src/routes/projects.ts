// The API routes for projects: creating, reading and updating them.
import {
  parseProjectUrl,
  saveNotionConnection,
  schema,
  type Db,
  type NotionApi,
  type Project,
} from '@union/core';
import { Hono } from 'hono';

import { toPublicProject } from '../api-types';
import { optionalInstallationId, requireApp } from '../github-credentials';
import type { OnboardingGitHub } from '../github-onboarding';
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
import { pullRequestRoutes } from './pull-requests';

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

/** The new project, and its Notion integration when the body connects one. */
function insertProject(
  db: Db,
  body: Record<string, unknown>,
  github: {
    owner: string;
    repo: string;
    githubProjectUrl: string | null;
    githubProjectNodeId: string;
  },
): Project {
  return db.transaction((tx) => {
    const project = tx
      .insert(schema.projects)
      .values({
        ...github,
        ...credentialsOf(db, body),
        notionToken: optionalText(body, 'notionToken') ?? null,
        config: {
          baseBranch: optionalText(body, 'baseBranch') ?? DEFAULT_BRANCH,
          notionDataSourceId: notionDataSourceOf(body),
        },
      })
      .returning()
      .get();
    // The integration is what is read; the project's fields stay in step until the client moves to it.
    saveNotionConnection(tx, project.id, {
      token: project.notionToken,
      dataSourceId: project.config.notionDataSourceId ?? null,
    });
    return project;
  });
}

export function projectRoutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
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
    const project = insertProject(db, body, {
      owner,
      repo,
      githubProjectUrl: projectUrl ?? null,
      githubProjectNodeId: nodeId ?? '',
    });
    return c.json(toPublicProject(project), CREATED);
  });

  routes.patch('/:id', (c) => updateProject(db, c));
  routes.delete('/:id', (c) => deleteProject(db, c));
  routes.route('/:projectId/investigations', investigationRoutes(db));
  routes.route('/:projectId/pull-requests', pullRequestRoutes(db, github, notion));

  return routes;
}
