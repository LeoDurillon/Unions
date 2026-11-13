// `GET /api/projects/:projectId/jira/picks/:type`: what a Jira field rule can pick, read from Jira
// when the editor asks. The picks are people, versions, components or sprints, never stored.
import {
  integrationOf,
  isJiraFieldType,
  isPickedType,
  jiraAuthOf,
  jiraPicks,
  readJiraConfig,
  type Db,
  type JiraApi,
} from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, CONFLICT, fail, requireId } from '../http';
import { guarded } from './tracker-errors';

export function jiraPickRoutes(db: Db, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.get('/:projectId/jira/picks/:type', async (c) => {
    const type = c.req.param('type');
    if (!isJiraFieldType(type) || !isPickedType(type)) {
      throw fail(BAD_REQUEST, 'Unknown kind of Jira list');
    }
    const projectId = requireId(c.req.param('projectId'), 'project id');
    const auth = jiraAuthOf(db, projectId);
    const read = readJiraConfig(integrationOf(db, projectId, 'jira')?.config);
    if (!auth || 'error' in read) {
      throw fail(CONFLICT, 'Connect the project to Jira first (Settings → Integrations → Jira)');
    }
    return c.json(await guarded(() => jiraPicks(jira, auth, read.config.projectKey, type)));
  });
  return routes;
}
