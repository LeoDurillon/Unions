// `/api/projects/:projectId/repository`: the Repository tab's reads from GitHub: the commit a branch or sha
// names, the tree at it, one file.
import { schema, type Db, type GitHubAuth } from '@union/core';
import { REPOSITORY_FILE_LIMIT, repositoryBlob } from '@union/core/repository-blob';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { RepositoryGitHub } from '../github-repository';
import { BAD_REQUEST, fail, NOT_FOUND, requireId } from '../http';
import type { RepositoryCommit } from '../repository-api-types';
import { guarded } from './github-errors';
import { authOf } from './ticket-base';

type Target = { auth: GitHubAuth; repo: { owner: string; repo: string }; baseBranch: string };

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function targetOf(db: Db, c: Context): Target {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  return {
    auth: authOf(db, project),
    repo: { owner: project.owner, repo: project.repo },
    baseBranch: project.config.baseBranch,
  };
}

function shaOf(c: Context): string {
  const sha = c.req.query('sha') ?? '';
  if (!SHA.test(sha)) {
    throw fail(BAD_REQUEST, '"sha" must be a full commit, tree or blob sha');
  }
  return sha;
}

/** A folder's path from the root, without a leading or trailing slash; undefined for the whole tree. */
function prefixOf(c: Context): string | undefined {
  const prefix = c.req.query('prefix');
  if (prefix === undefined || prefix === '') {
    return undefined;
  }
  if (prefix.startsWith('/') || prefix.endsWith('/') || prefix.split('/').includes('..')) {
    throw fail(BAD_REQUEST, '"prefix" must be a folder path from the root');
  }
  return prefix;
}

async function commit(db: Db, github: RepositoryGitHub, c: Context): Promise<Response> {
  const target = targetOf(db, c);
  const asked = c.req.query('ref')?.trim() ?? '';
  const ref = asked === '' ? target.baseBranch : asked;
  const found = await guarded(() => github.resolveCommit(target.auth, target.repo, ref));
  if (!found) {
    throw fail(NOT_FOUND, `No branch, tag or commit named "${ref}" in the repository`);
  }
  const answer: RepositoryCommit = { ref, ...found };
  return c.json(answer);
}

async function tree(db: Db, github: RepositoryGitHub, c: Context): Promise<Response> {
  const target = targetOf(db, c);
  const read = { sha: shaOf(c), prefix: prefixOf(c) };
  const found = await guarded(() => github.getTree(target.auth, target.repo, read));
  if (!found) {
    throw fail(NOT_FOUND, 'No such folder in the repository');
  }
  return c.json(found);
}

async function blob(db: Db, github: RepositoryGitHub, c: Context): Promise<Response> {
  const target = targetOf(db, c);
  const sha = shaOf(c);
  // The tree tells the size: a file too large to show is not downloaded at all.
  const size = Number(c.req.query('size'));
  if (Number.isFinite(size) && size > REPOSITORY_FILE_LIMIT) {
    return c.json({ kind: 'too-large', size });
  }
  const bytes = await guarded(() => github.getBlob(target.auth, target.repo, sha));
  if (!bytes) {
    throw fail(NOT_FOUND, 'No such file in the repository');
  }
  return c.json(repositoryBlob(c.req.query('path') ?? '', bytes));
}

/** The Repository tab's reads from GitHub, under `/api/projects/:projectId/repository`. */
export function repositoryRoutes(db: Db, github: RepositoryGitHub): Hono {
  const routes = new Hono();
  routes.get('/:projectId/repository/commit', (c) => commit(db, github, c));
  routes.get('/:projectId/repository/tree', (c) => tree(db, github, c));
  routes.get('/:projectId/repository/blob', (c) => blob(db, github, c));
  return routes;
}
