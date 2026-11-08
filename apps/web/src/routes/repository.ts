// `/api/projects/:projectId/repository`: the Repository tab's reads from GitHub: the commit a branch or sha
// names, the tree at it, one file, an image's own bytes for a rendered Markdown file, and the branches to pick.

import { schema, type Db, type GitHubAuth } from '@union/core';
import {
  REPOSITORY_FILE_LIMIT,
  REPOSITORY_IMAGE_LIMIT,
  repositoryBlob,
  repositoryImageType,
} from '@union/core/repository-blob';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import type { RepositoryGitHub } from '../github-repository';
import { BAD_REQUEST, fail, NOT_FOUND, PAYLOAD_TOO_LARGE, requireId } from '../http';
import type { RepositoryCommit } from '../repository-api-types';
import { guarded } from './github-errors';
import { authOf } from './tickets/ticket-base';

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

/**
 * An image of the repository as its own bytes, for `<img>` in a rendered Markdown file. Images only: the
 * sandbox and nosniff keep an SVG opened on its own from running anything.
 */
async function raw(db: Db, github: RepositoryGitHub, c: Context): Promise<Response> {
  const target = targetOf(db, c);
  const sha = shaOf(c);
  const type = repositoryImageType(c.req.query('path') ?? '');
  if (type === null) {
    throw fail(BAD_REQUEST, 'Only images are served as they are');
  }
  const size = Number(c.req.query('size'));
  if (Number.isFinite(size) && size > REPOSITORY_IMAGE_LIMIT) {
    throw fail(PAYLOAD_TOO_LARGE, 'This image is too large to show here');
  }
  const bytes = await guarded(() => github.getBlob(target.auth, target.repo, sha));
  if (!bytes) {
    throw fail(NOT_FOUND, 'No such file in the repository');
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': type,
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}

/** The repository's branches for the tab's picker, and the base branch it opens on. */
async function branches(
  db: Db,
  github: Pick<OnboardingGitHub, 'listBranches'>,
  c: Context,
): Promise<Response> {
  const target = targetOf(db, c);
  const names = await guarded(() => github.listBranches(target.auth, target.repo));
  if (!names) {
    throw fail(NOT_FOUND, `${target.repo.owner}/${target.repo.repo} is not reachable`);
  }
  return c.json({ branches: names, projectBase: target.baseBranch });
}

/** The Repository tab's reads from GitHub, under `/api/projects/:projectId/repository`. */
export function repositoryRoutes(
  db: Db,
  {
    github: branchReads,
    repository: github,
  }: { github: Pick<OnboardingGitHub, 'listBranches'>; repository: RepositoryGitHub },
): Hono {
  const routes = new Hono();
  routes.get('/:projectId/repository/branches', (c) => branches(db, branchReads, c));
  routes.get('/:projectId/repository/commit', (c) => commit(db, github, c));
  routes.get('/:projectId/repository/tree', (c) => tree(db, github, c));
  routes.get('/:projectId/repository/blob', (c) => blob(db, github, c));
  routes.get('/:projectId/repository/raw', (c) => raw(db, github, c));
  return routes;
}
