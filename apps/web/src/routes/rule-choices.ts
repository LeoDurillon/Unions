// `GET /api/projects/:projectId/github/rule-choices`: the labels and users a pull request rule picks from, read from GitHub.
import { projectGitHubAuth, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { CONFLICT, fail, NOT_FOUND, requireId } from '../http';

async function ruleChoices(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(CONFLICT, 'This project has no GitHub credentials');
  }
  const choices = await github.listRuleChoices(auth, { owner: project.owner, repo: project.repo });
  if (!choices) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} is not reachable`);
  }
  return c.json(choices);
}

export function ruleChoiceRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:projectId/github/rule-choices', (c) => ruleChoices(db, github, c));
  return routes;
}
