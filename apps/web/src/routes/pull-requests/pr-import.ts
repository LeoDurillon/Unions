// `/api/tickets/github-pull-request`: a ticket from an open pull request of the project's repository, on its branch.

import { projectGitHubAuth, type Db, type Project } from '@union/core';
import { Hono, type Context } from 'hono';

import type { PullRequestImport, PullRequestSource } from '../../api-types';
import type { OnboardingGitHub } from '../../github-onboarding';
import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireText,
} from '../../http';
import { planPullRequestImport, type PullRequestPlan } from '../../pr-import-plan';
import { createImportedTicket, existingTicket, loadProject } from '../../pr-import-ticket';
import { parsePullRequestRef } from '../../pull-request-ref';
import { guarded } from '../github-errors';
import { findTicket, summarize } from '../tickets/ticket-links';

type Read = { project: Project; source: PullRequestSource; plan: PullRequestPlan };

/** The project and the pull request the body names, read from GitHub with the issues it closes. */
async function read(
  db: Db,
  github: OnboardingGitHub,
  body: Record<string, unknown>,
): Promise<Read> {
  const project = loadProject(db, Number(body.projectId));
  const { owner, repo } = project;
  const number = parsePullRequestRef(requireText(body, 'pullRequest'), owner, repo);
  if (number === null) {
    throw fail(BAD_REQUEST, `Give a pull request number or a URL of ${owner}/${repo}`);
  }
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const source = await guarded(() => github.getPullRequestSource(auth, { owner, repo }, number));
  if (!source) {
    throw fail(NOT_FOUND, `${owner}/${repo} has no pull request #${number}`);
  }
  return { project, source, plan: planPullRequestImport(source) };
}

async function preview(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const found = await read(db, github, await readObject(c.req.raw));
  const { source, plan } = found;
  const result: PullRequestImport = {
    number: source.number,
    title: source.title,
    url: source.url,
    headBranch: source.headBranch,
    baseBranch: source.baseBranch,
    draft: source.draft,
    issue: plan.issue && {
      number: plan.issue.number,
      title: plan.issue.title,
      url: plan.issue.url,
    },
    steps: plan.steps.map(({ step, version, validation }) => ({ step, version, validation })),
    flow: plan.flow,
    ticketId: existingTicket(db, found.project.id, found),
    refusal: plan.refusal,
  };
  return c.json(result);
}

/** The ticket on the pull request's branch; the worker then waits for approval at Implementation. */
async function create(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const found = await read(db, github, await readObject(c.req.raw));
  const { project, source, plan } = found;
  if (plan.refusal) {
    throw fail(CONFLICT, plan.refusal);
  }
  const existing = existingTicket(db, found.project.id, found);
  if (existing !== null) {
    throw fail(CONFLICT, `#${source.number} or its issue is already ticket ${existing}`);
  }
  const ticket = createImportedTicket(db, project.id, source, plan);
  return c.json(summarize(ticket, findTicket(db)), CREATED);
}

/** `/api/tickets/github-pull-request`: a ticket from an open pull request, on its branch. */
export function pullRequestImportRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.post('/preview', (c) => preview(db, github, c));
  routes.post('/', (c) => create(db, github, c));
  return routes;
}
