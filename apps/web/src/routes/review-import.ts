import {
  listSlices,
  projectGitHubAuth,
  schema,
  type Db,
  type GitHubAuth,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { DiscussionResponse, PullRequestDiscussion, StackImportResult } from '../api-types';
import type { OnboardingGitHub } from '../github-onboarding';
import { CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireText } from '../http';
import { importedUrls, importNote, importThreads } from '../review-import';
import { importAnchor } from '../slice-snapshot';
import { pickedPullRequest } from '../ticket-pull-request';
import { guarded } from './github-errors';

type Fetched = { number: number; url: string; discussion: PullRequestDiscussion };
type Access = { auth: GitHubAuth; owner: string; repo: string };

/** The ticket's project's repository and credentials to read it. */
function accessFor(db: Db, ticket: Ticket): Access {
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
  return { auth, owner: project.owner, repo: project.repo };
}

/** A pull request's discussion, read from GitHub (never written). */
async function discussionOf(
  github: OnboardingGitHub,
  access: Access,
  number: number,
): Promise<Fetched> {
  const { auth, owner, repo } = access;
  const discussion = await guarded(() => github.getDiscussion(auth, { owner, repo }, number));
  if (discussion === null) {
    throw fail(NOT_FOUND, `${owner}/${repo} has no pull request #${number}`);
  }
  return { number, url: `https://github.com/${owner}/${repo}/pull/${number}`, discussion };
}

/** The linked pull request's discussion (or a slice's, `?pr=`). */
function fetchFor(db: Db, github: OnboardingGitHub, ticket: Ticket, c: Context): Promise<Fetched> {
  const number = pickedPullRequest(db, ticket, c);
  return discussionOf(github, accessFor(db, ticket), number);
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
  const { number, discussion } = await fetchFor(db, github, ticket, c);
  const anchor = importAnchor(db, ticket.id, number);
  return c.json(importThreads(db, ticket.id, discussion.threads, anchor));
}

/** Imports one review summary or conversation comment, picked by its GitHub link, as a general draft. */
export async function importPullRequestNote(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Response> {
  const url = requireText(await readObject(c.req.raw), 'url');
  const { number, discussion } = await fetchFor(db, github, ticket, c);
  const note = discussion.notes.find((candidate) => candidate.url === url);
  if (!note) {
    throw fail(NOT_FOUND, 'That comment is not in the pull request discussion');
  }
  if (!importNote(db, ticket.id, note, importAnchor(db, ticket.id, number))) {
    throw fail(CONFLICT, 'That comment is already among the review comments');
  }
  return c.json({ url }, CREATED);
}

/**
 * A split ticket's import: the unresolved threads of every open slice's pull request, each on its
 * slice's own diff. Every discussion is read before anything is imported.
 */
export async function importStackComments(
  db: Db,
  github: OnboardingGitHub,
  ticket: Ticket,
  c: Context,
): Promise<Response> {
  const numbers = listSlices(db, ticket.id).flatMap((slice) =>
    slice.prNumber === null || slice.prState === 'merged' || slice.prState === 'closed'
      ? []
      : [slice.prNumber],
  );
  if (numbers.length === 0) {
    throw fail(CONFLICT, 'This ticket has no open slice to import from');
  }
  const access = accessFor(db, ticket);
  const fetched = await Promise.all(numbers.map((number) => discussionOf(github, access, number)));
  const results: StackImportResult = fetched.map(({ number, discussion }) =>
    Object.assign(
      importThreads(db, ticket.id, discussion.threads, importAnchor(db, ticket.id, number)),
      { number },
    ),
  );
  return c.json(results);
}
