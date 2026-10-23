import { projectGitHubAuth, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { DiscussionResponse, PullRequestDiscussion } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireText } from '../http';
import { importedUrls, importNote, importThreads } from '../review-import';
import { pickedPullRequest } from '../ticket-pull-request';
import { guarded } from './github-errors';

type Fetched = { number: number; url: string; discussion: PullRequestDiscussion };

/** The linked pull request's discussion (or a slice's, `?pr=`), read from GitHub (never written). */
async function fetchFor(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Fetched> {
  const number = pickedPullRequest(db, ticket, c);
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const auth = project ? projectGitHubAuth(db, project, process.env.GITHUB_TOKEN) : null;
  if (!project || !auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const repo = { owner: project.owner, repo: project.repo };
  const discussion = await guarded(() => github.getDiscussion(auth, repo, number));
  if (discussion === null) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} has no pull request #${number}`);
  }
  const url = `https://github.com/${project.owner}/${project.repo}/pull/${number}`;
  return { number, url, discussion };
}

/** The PR tab: threads, review summaries and comments, and which of them are already imported. */
export async function getDiscussion(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Response> {
  const { number, url, discussion } = await fetchFor(db, github, ticket, c);
  const body: DiscussionResponse = {
    ...discussion,
    number,
    url,
    imported: importedUrls(db, ticket.id),
  };
  return c.json(body);
}

/** Imports the unresolved line threads as draft comments. */
export async function importPullRequestComments(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Response> {
  const { discussion } = await fetchFor(db, github, ticket, c);
  return c.json(importThreads(db, ticket.id, discussion.threads));
}

/** Imports one review summary or conversation comment, picked by its GitHub link, as a general draft. */
export async function importPullRequestNote(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Response> {
  const url = requireText(await readObject(c.req.raw), 'url');
  const { discussion } = await fetchFor(db, github, ticket, c);
  const note = discussion.notes.find((candidate) => candidate.url === url);
  if (!note) {
    throw fail(NOT_FOUND, 'That comment is not in the pull request discussion');
  }
  if (!importNote(db, ticket.id, note)) {
    throw fail(CONFLICT, 'That comment is already among the review comments');
  }
  return c.json({ url }, CREATED);
}
