// The Jira Cloud calls Union makes (`JiraApi`), and the client that makes them over fetch (REST v3, API token).
import { jiraSiteOf } from './jira-config';
import { JiraError } from './jira-error';
import {
  accountOf,
  errorMessageOf,
  issueOf,
  projectOf,
  statusesOf,
  type JiraAccount,
  type JiraIssue,
  type JiraProject,
  type JiraStatus,
} from './jira-parse';

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const REQUEST_TIMEOUT_MS = 30_000;
const ISSUE_FIELDS = 'summary,description,attachment,project';

/** Who calls: the site, and the account's email and API token (Basic auth). */
export type JiraAuth = { site: string; email: string; token: string };

/** The Jira calls Union makes. Tests substitute a fake. */
export type JiraApi = {
  /** The account the email and token belong to; fails with 401 when they do not match. */
  myself(auth: JiraAuth): Promise<JiraAccount>;
  project(auth: JiraAuth, key: string): Promise<JiraProject>;
  /** The statuses of the project's workflows, each once. */
  statuses(auth: JiraAuth, key: string): Promise<JiraStatus[]>;
  issue(auth: JiraAuth, key: string): Promise<JiraIssue>;
};

function failure(status: number, body: unknown, retryAfter: string | null): JiraError {
  switch (status) {
    case UNAUTHORIZED: {
      return new JiraError('Jira rejected this email and API token.', UNAUTHORIZED);
    }
    case FORBIDDEN: {
      return new JiraError('This Jira account is not allowed to see this.', FORBIDDEN);
    }
    case NOT_FOUND: {
      return new JiraError('Not found, or not visible to this Jira account.', NOT_FOUND);
    }
    case TOO_MANY_REQUESTS: {
      const wait = retryAfter === null ? 'a moment' : `${retryAfter} s`;
      return new JiraError(`Jira is limiting requests: try again in ${wait}.`, status);
    }
    default: {
      return new JiraError(`Jira: ${errorMessageOf(body) ?? `HTTP ${status}`}`, status);
    }
  }
}

export class FetchJiraApi implements JiraApi {
  private async get(auth: JiraAuth, path: string): Promise<unknown> {
    // The token goes only to an atlassian.net site, whatever the stored config says.
    const site = jiraSiteOf(auth.site);
    if (site === null) {
      throw new JiraError('The Jira site is not an atlassian.net address.', NOT_FOUND);
    }
    const basic = Buffer.from(`${auth.email}:${auth.token}`).toString('base64');
    const response = await fetch(`${site}/rest/api/3${path}`, {
      headers: { authorization: `Basic ${basic}`, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw failure(response.status, body, response.headers.get('retry-after'));
    }
    return body;
  }

  async myself(auth: JiraAuth): Promise<JiraAccount> {
    return accountOf(await this.get(auth, '/myself'));
  }

  async project(auth: JiraAuth, key: string): Promise<JiraProject> {
    return projectOf(await this.get(auth, `/project/${encodeURIComponent(key)}`));
  }

  async statuses(auth: JiraAuth, key: string): Promise<JiraStatus[]> {
    return statusesOf(await this.get(auth, `/project/${encodeURIComponent(key)}/statuses`));
  }

  async issue(auth: JiraAuth, key: string): Promise<JiraIssue> {
    const path = `/issue/${encodeURIComponent(key)}?fields=${ISSUE_FIELDS}`;
    return issueOf(await this.get(auth, path));
  }
}
