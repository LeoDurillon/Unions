// `<review>/commits`: the pull request's commits, and one commit's files and patches, to read the
// change one commit at a time.
import { isIgnoredPath, type Db, type PullRequestFile } from '@union/core';
import { Hono, type Context } from 'hono';

import type { CommitDiffResponse, CommitsResponse } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, fail, NOT_FOUND, requireId } from '../http';
import { guarded } from './github-errors';
import { authOf, load, type Project } from './pr-review-load';

const SHA = /^[0-9a-f]{40}$/u;
/** A commit's files never change: the last ones read are kept, this many commits. */
const CACHED_COMMITS = 50;

/** Commits' files by project and SHA, oldest read first. */
const cache = new Map<string, PullRequestFile[]>();

function shaOf(c: Context): string {
  const sha = c.req.param('sha') ?? '';
  if (!SHA.test(sha)) {
    throw fail(BAD_REQUEST, 'A commit is named by its full SHA');
  }
  return sha;
}

async function commitFiles(
  db: Db,
  github: OnboardingGitHub,
  c: Context,
): Promise<{ sha: string; project: Project; files: PullRequestFile[] }> {
  const { project } = load(db, c);
  const sha = shaOf(c);
  const key = `${project.id}:${sha}`;
  const cached = cache.get(key);
  if (cached) {
    return { sha, project, files: cached };
  }
  const repo = { owner: project.owner, repo: project.repo };
  const files = await guarded(() => github.getCommitFiles(authOf(db, project), repo, sha));
  if (!files) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no commit ${sha}`);
  }
  cache.set(key, files);
  const oldest = cache.keys().next().value;
  if (cache.size > CACHED_COMMITS && oldest !== undefined) {
    cache.delete(oldest);
  }
  return { sha, project, files };
}

/**
 * `<review>/commits`: the pull request's commits, and one commit's files and patches, to read the
 * change one commit at a time. Read only: comments are written on the whole diff.
 */
export function prCommitRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/', async (c) => {
    const { review, project } = load(db, c);
    const repo = { owner: project.owner, repo: project.repo };
    const commits = await guarded(() =>
      github.listReviewCommits(authOf(db, project), repo, review.prNumber),
    );
    if (!commits) {
      throw fail(
        NOT_FOUND,
        `${project.owner}/${project.repo} has no pull request #${review.prNumber}`,
      );
    }
    const body: CommitsResponse = { commits, sinceReview: null };
    return c.json(body);
  });
  routes.get('/:sha/diff', async (c) => {
    const { sha, project, files } = await commitFiles(db, github, c);
    const patterns = project.config.reviewIgnore ?? [];
    const hideLockFiles = project.config.hideLockFiles !== false;
    const body: CommitDiffResponse = {
      sha,
      files: files.map(({ patch: _patch, ...file }) =>
        Object.assign(file, { ignored: isIgnoredPath(file.path, patterns, hideLockFiles) }),
      ),
    };
    return c.json(body);
  });
  routes.get('/:sha/files/:fileId', async (c) => {
    const { files } = await commitFiles(db, github, c);
    const fileId = requireId(c.req.param('fileId'), 'file id');
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file) {
      throw fail(NOT_FOUND, 'File not found in the commit');
    }
    return c.json({ id: file.id, path: file.path, patch: file.patch });
  });
  return routes;
}
