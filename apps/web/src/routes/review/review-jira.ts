// `<review>/jira`: the Jira issues a pull request under review is linked to (its `jira` specs): their description and
// comments, read only; checking one, linking it, unlinking it; and the issues the pull request names, suggested.

import {
  integrationKind,
  integrationOf,
  issueMarkdown,
  jiraAuthOf,
  jiraKeysIn,
  linkedJiraIssues,
  readJiraConfig,
  linkJiraIssue,
  unlinkJiraIssue,
  type Db,
  type JiraApi,
  type JiraAuth,
} from '@union/core';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, readObject, requireText } from '../../http';
import type { ReviewJiraIssue, ReviewJiraLink } from '../../review-jira-types';
import { guarded } from '../notion';
import { authOf, load, type Project } from '../pr-review-load';

/** A description rarely names more; each is a Jira read. */
const MAX_SUGGESTIONS = 10;

type Access = { auth: JiraAuth; projectKey: string; config: unknown };
type Clients = { github: OnboardingGitHub; jira: JiraApi };

/** Who reads Jira for the review's project; null when it is not connected. */
function accessOf(db: Db, project: Project): Access | null {
  const integration = integrationOf(db, project.id, 'jira');
  const auth = jiraAuthOf(db, project.id);
  const read = integration ? readJiraConfig(integration.config) : null;
  if (!integration || !auth || !read || 'error' in read) {
    return null;
  }
  return { auth, projectKey: read.config.projectKey, config: integration.config };
}

function requireAccess(db: Db, project: Project): Access {
  const access = accessOf(db, project);
  if (!access) {
    throw fail(CONFLICT, 'Connect the project to Jira first (Settings → Integrations → Jira)');
  }
  return access;
}

async function readLink(jira: JiraApi, access: Access, ref: string): Promise<ReviewJiraLink> {
  const kind = integrationKind('jira');
  const key = kind.parseRef(ref);
  if (!key) {
    throw fail(BAD_REQUEST, 'That is not a Jira issue key or link');
  }
  const elsewhere = kind.refError?.(ref, access.config) ?? null;
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  // Any issue of the site the account sees: a pull request may implement another project's.
  const issue = await guarded(() => jira.issue(access.auth, key));
  return { key: issue.key, summary: issue.summary, url: `${access.auth.site}/browse/${issue.key}` };
}

async function issueText(jira: JiraApi, auth: JiraAuth, key: string): Promise<ReviewJiraIssue> {
  const issue = await guarded(() => jira.issue(auth, key));
  const comments = await jira.comments(auth, key).then(
    (read) => read.comments,
    (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
  );
  return {
    key: issue.key,
    summary: issue.summary,
    url: `${auth.site}/browse/${issue.key}`,
    markdown: issueMarkdown(issue, auth.site).trim(),
    comments,
  };
}

/** Every linked issue with its description and comments, in the specs' order. */
async function issuesText(db: Db, jira: JiraApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const linked = linkedJiraIssues(db, { kind: 'review', id: review.id });
  if (linked.length === 0) {
    return c.json([]);
  }
  const { auth } = requireAccess(db, project);
  return c.json(await Promise.all(linked.map((issue) => issueText(jira, auth, issue.id))));
}

async function link(db: Db, jira: JiraApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const found = await readLink(
    jira,
    requireAccess(db, project),
    requireText(await readObject(c.req.raw), 'issue'),
  );
  linkJiraIssue(
    db,
    { kind: 'review', id: review.id },
    { id: found.key, title: `${found.key} ${found.summary}`, url: found.url },
  );
  return c.json(found);
}

/** The project's issues the pull request names (title, branch, description), readable and not linked yet. */
async function suggestions(db: Db, clients: Clients, c: Context): Promise<Response> {
  const { jira, github } = clients;
  const { review, project } = load(db, c);
  const access = accessOf(db, project);
  if (!access) {
    return c.json([]);
  }
  const linked = new Set(
    linkedJiraIssues(db, { kind: 'review', id: review.id }).map((issue) => issue.id),
  );
  // The title and branch are known; the description is read, and left out if GitHub does not answer.
  const discussion = await github
    .getDiscussion(authOf(db, project), project, review.prNumber)
    .catch(() => null);
  const texts = [review.title, review.headBranch, discussion?.description ?? ''];
  const keys = jiraKeysIn(texts, access.projectKey, access.auth.site)
    .filter((key) => !linked.has(key))
    .slice(0, MAX_SUGGESTIONS);
  const found = await Promise.all(
    keys.map((key) =>
      readLink(jira, access, key).then(
        (issue): ReviewJiraLink[] => [issue],
        (): ReviewJiraLink[] => [],
      ),
    ),
  );
  return c.json(found.flat());
}

/**
 * Under `<review>`: `GET /jira` the linked issues' text and comments, `GET /jira/suggestions`, `POST /jira/check`
 * an issue before linking, `PUT /jira` links one, `DELETE /jira/:key` unlinks one. Jira is only read.
 */
export function reviewJiraRoutes(db: Db, clients: Clients): Hono {
  const { jira } = clients;
  const routes = new Hono();
  routes.get('/', (c) => issuesText(db, jira, c));
  routes.get('/suggestions', (c) => suggestions(db, clients, c));
  routes.post('/check', async (c) => {
    const { project } = load(db, c);
    const ref = requireText(await readObject(c.req.raw), 'issue');
    return c.json(await readLink(jira, requireAccess(db, project), ref));
  });
  routes.put('/', (c) => link(db, jira, c));
  routes.delete('/:key', (c) => {
    const { review } = load(db, c);
    unlinkJiraIssue(db, { kind: 'review', id: review.id }, c.req.param('key'));
    return c.json({ number: review.prNumber });
  });
  return routes;
}
