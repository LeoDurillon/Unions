// What a rule picks from on GitHub, read live: the repo's labels and users (`github/rule-choices`), the Project's fields (`github/project-fields`).
import { projectGitHubAuth, schema, type Db, type GitHubAuth, type Project } from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { CONFLICT, fail, NOT_FOUND, requireId } from '../http';

function load(db: Db, c: Context): { project: Project; auth: GitHubAuth } {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(CONFLICT, 'This project has no GitHub credentials');
  }
  return { project, auth };
}

async function ruleChoices(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { project, auth } = load(db, c);
  const choices = await github.listRuleChoices(auth, { owner: project.owner, repo: project.repo });
  if (!choices) {
    throw fail(NOT_FOUND, `${project.owner}/${project.repo} is not reachable`);
  }
  return c.json(choices);
}

async function projectFields(db: Db, github: OnboardingGitHub, c: Context): Promise<Response> {
  const { project, auth } = load(db, c);
  if (project.githubProjectNodeId === '') {
    throw fail(CONFLICT, 'This project has no GitHub Project');
  }
  const fields = await github.listProjectFields(auth, project.githubProjectNodeId);
  if (!fields) {
    throw fail(NOT_FOUND, 'The GitHub Project is not reachable');
  }
  return c.json(fields);
}

export function ruleChoiceRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.get('/:projectId/github/rule-choices', (c) => ruleChoices(db, github, c));
  routes.get('/:projectId/github/project-fields', (c) => projectFields(db, github, c));
  return routes;
}
