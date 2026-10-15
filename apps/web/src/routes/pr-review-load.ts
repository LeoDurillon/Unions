// Loads the review and project a pull request route refers to, and the GitHub auth to act on them.
import { projectGitHubAuth, schema, type Db } from '@union/core';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { CONFLICT, fail, NOT_FOUND, requireId } from '../http';

export type Review = typeof schema.currentReviews.$inferSelect;
export type Project = typeof schema.projects.$inferSelect;

export function load(db: Db, c: Context): { review: Review; project: Project } {
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

export function authOf(
  db: Db,
  project: Project,
): NonNullable<ReturnType<typeof projectGitHubAuth>> {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  return auth;
}
