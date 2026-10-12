import { isIgnoredPath, projectGitHubAuth, schema, type Db } from '@union/core';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { DiffResponse, DiscussionResponse } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { guarded } from './github-errors';
import {
  addComment,
  deleteComment,
  draftsOf,
  editComment,
  listComments,
  type CommentDiff,
  type CommentOwner,
} from './review-comments';

type Review = typeof schema.currentReviews.$inferSelect;
type Project = typeof schema.projects.$inferSelect;

function load(db: Db, c: Context): { review: Review; project: Project } {
  const projectId = requireId(c.req.param('projectId'), 'project id');
  const number = requireId(c.req.param('number'), 'pull request number');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  const review = db
    .select()
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, projectId),
        eq(schema.currentReviews.prNumber, number),
      ),
    )
    .get();
  if (!project || !review) {
    throw fail(NOT_FOUND, `#${number} is not among the current reviews`);
  }
  return { review, project };
}

function owner(review: Review): CommentOwner {
  return { kind: 'review', id: review.id };
}

/** The files as last fetched: comments are checked against them. */
function commentDiff(review: Review): CommentDiff | null {
  const { files, headSha } = review;
  if (!files || !headSha) {
    return null;
  }
  return { headSha, patchOf: (path) => files.find((file) => file.path === path)?.patch };
}

function authOf(db: Db, project: Project): NonNullable<ReturnType<typeof projectGitHubAuth>> {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  return auth;
}

/** The pull request's description and discussion, read from GitHub (the Description and Comments tabs). */
async function getDiscussion(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const auth = authOf(db, project);
  const repo = { owner: project.owner, repo: project.repo };
  const discussion = await guarded(() => github.getDiscussion(auth, repo, review.prNumber));
  if (!discussion) {
    throw fail(
      NOT_FOUND,
      `${project.owner}/${project.repo} has no pull request #${review.prNumber}`,
    );
  }
  const body: DiscussionResponse = {
    ...discussion,
    number: review.prNumber,
    url: review.url,
    imported: [],
  };
  return c.json(body);
}

/** Reads the pull request's files from GitHub, keeps them on the review, and lists them. */
async function getDiff(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const auth = authOf(db, project);
  const repo = { owner: project.owner, repo: project.repo };
  const fetched = await guarded(() => github.getPullRequestFiles(auth, repo, review.prNumber));
  if (!fetched) {
    throw fail(
      NOT_FOUND,
      `${project.owner}/${project.repo} has no pull request #${review.prNumber}`,
    );
  }
  db.update(schema.currentReviews)
    .set({ files: fetched.files, headSha: fetched.headSha })
    .where(eq(schema.currentReviews.id, review.id))
    .run();
  const patterns = project.config.reviewIgnore ?? [];
  const hideLockFiles = project.config.hideLockFiles !== false;
  const body: DiffResponse = {
    snapshot: { headSha: fetched.headSha, baseBranch: fetched.baseBranch, createdAt: Date.now() },
    files: fetched.files.map(({ patch: _patch, ...file }) =>
      Object.assign(file, { ignored: isIgnoredPath(file.path, patterns, hideLockFiles) }),
    ),
    canSend: review.submitStatus !== 'sending',
    pullRequest: null,
  };
  return c.json(body);
}

function getFile(db: Db, c: Context): Response {
  const { review } = load(db, c);
  const fileId = requireId(c.req.param('fileId'), 'file id');
  const file = review.files?.find((candidate) => candidate.id === fileId);
  if (!file) {
    throw fail(NOT_FOUND, 'File not found in the pull request');
  }
  return c.json({ id: file.id, path: file.path, patch: file.patch });
}

/** Queues the drafts and an optional summary for the worker to post on GitHub as one review. */
async function submit(db: Db, c: Context): Promise<Response> {
  const { review } = load(db, c);
  const body = await readObject(c.req.raw);
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (review.submitStatus === 'sending') {
    throw fail(CONFLICT, 'This review is already being posted');
  }
  if (draftsOf(db, owner(review)).length === 0 && summary === '') {
    throw fail(BAD_REQUEST, 'Add at least one comment or an overall note');
  }
  const command = db.transaction((tx) => {
    tx.update(schema.currentReviews)
      .set({ submitStatus: 'sending', submitError: null })
      .where(eq(schema.currentReviews.id, review.id))
      .run();
    return tx
      .insert(schema.commands)
      .values({ type: 'submit_pr_review', payload: { reviewId: review.id, summary } })
      .returning()
      .get();
  });
  return c.json(command, ACCEPTED);
}

/**
 * `/api/projects/:projectId/pull-requests/reviews/:number`: the description and discussion, the diff,
 * the comments, and posting them.
 */
export function prReviewRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/diff', (c) => getDiff(db, github, c));
  routes.get('/discussion', (c) => getDiscussion(db, github, c));
  routes.get('/diff/files/:fileId', (c) => getFile(db, c));
  routes.get('/comments', (c) => {
    const { review } = load(db, c);
    return listComments(c, db, owner(review), review.headSha ?? undefined);
  });
  routes.post('/comments', (c) => {
    const { review } = load(db, c);
    return addComment(c, db, owner(review), commentDiff(review));
  });
  routes.patch('/comments/:commentId', (c) => editComment(c, db, owner(load(db, c).review)));
  routes.delete('/comments/:commentId', (c) => deleteComment(c, db, owner(load(db, c).review)));
  routes.post('/review', (c) => submit(db, c));
  return routes;
}
