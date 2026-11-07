// The Jira Cloud calls Union makes (`JiraApi`), and the client that makes them over fetch (REST v3, API token).
import { commentPageOf, type JiraComment, type JiraCommentPage } from './jira-comments';
import { jiraSiteOf } from './jira-config';
import { JiraError } from './jira-error';
import type { JiraFieldInfo } from './jira-field-types';
import {
  accountOf,
  editMetaOf,
  fieldsOf,
  statusOf,
  transitionsOf,
  mediaIdOf,
  errorMessageOf,
  issueOf,
  projectOf,
  statusesOf,
  type JiraAccount,
  type JiraEditField,
  type JiraTransition,
  type JiraIssue,
  type JiraProject,
  type JiraStatus,
} from './jira-parse';
import type { AdfDocument } from './text-adf';

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const REQUEST_TIMEOUT_MS = 30_000;
const ISSUE_FIELDS = 'summary,description,attachment,project';
/** Jira's largest page of comments. */
const COMMENTS_PER_PAGE = 100;
/** 500 comments: an issue with more is read in Jira for its oldest ones. */
const MAX_COMMENT_PAGES = 5;

/** Who calls: the site, and the account's email and API token (Basic auth). */
export type JiraAuth = { site: string; email: string; token: string };

/** The Jira calls Union makes. Tests substitute a fake. */
export type JiraApi = {
  /** The account the email and token belong to; fails with 401 when they do not match. */
  myself(auth: JiraAuth): Promise<JiraAccount>;
  project(auth: JiraAuth, key: string): Promise<JiraProject>;
  /** The statuses of the project's workflows, each once. */
  statuses(auth: JiraAuth, key: string): Promise<JiraStatus[]>;
  /** The site's fields a rule can set (`GET /field`), by name. */
  fields(auth: JiraAuth): Promise<JiraFieldInfo[]>;
  issue(auth: JiraAuth, key: string): Promise<JiraIssue>;
  /** The transitions the issue's workflow offers from its current status. */
  transitions(auth: JiraAuth, key: string): Promise<JiraTransition[]>;
  transitionIssue(auth: JiraAuth, key: string, transitionId: string): Promise<void>;
  issueStatus(auth: JiraAuth, key: string): Promise<{ id: string; name: string }>;
  /** The fields the issue's edit screen has, with a select's option names. */
  editMeta(auth: JiraAuth, key: string): Promise<Record<string, JiraEditField>>;
  /** Sets `fields` and applies `update` operations (labels added), in one request. */
  updateIssue(
    auth: JiraAuth,
    key: string,
    change: { fields: Record<string, unknown>; update: Record<string, unknown> },
  ): Promise<void>;
  addComment(auth: JiraAuth, key: string, body: AdfDocument): Promise<void>;
  /**
   * The Media Services id of an attachment's file: what a file card in the description names it by.
   * Read from where Jira redirects its download, without downloading; null when it does not say.
   */
  attachmentMediaId(auth: JiraAuth, attachmentId: string): Promise<string | null>;
  /**
   * The issue's comments, oldest first: the last `MAX_COMMENT_PAGES` pages of them when it has more,
   * with how many it has (`total`), so the tab can say how many it leaves out.
   */
  comments(auth: JiraAuth, key: string): Promise<JiraCommentPage>;
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

function issuePath(key: string): string {
  return `/issue/${encodeURIComponent(key)}`;
}

export class FetchJiraApi implements JiraApi {
  private request(
    auth: JiraAuth,
    path: string,
    redirect: 'error' | 'manual',
    write?: { method: 'POST' | 'PUT'; body: unknown },
  ): Promise<Response> {
    // The token goes only to an atlassian.net site, whatever the stored config says.
    const site = jiraSiteOf(auth.site);
    if (site === null) {
      throw new JiraError('The Jira site is not an atlassian.net address.', NOT_FOUND);
    }
    const basic = Buffer.from(`${auth.email}:${auth.token}`).toString('base64');
    const headers: Record<string, string> = {
      authorization: `Basic ${basic}`,
      accept: 'application/json',
    };
    return fetch(`${site}/rest/api/3${path}`, {
      ...(write
        ? {
            method: write.method,
            body: JSON.stringify(write.body),
            headers: { ...headers, 'content-type': 'application/json' },
          }
        : { headers }),
      redirect,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** A read, or a write when `write` is given; Jira answers most writes with 204 and no body. */
  private async get(
    auth: JiraAuth,
    path: string,
    write?: { method: 'POST' | 'PUT'; body: unknown },
  ): Promise<unknown> {
    const response = await this.request(auth, path, 'error', write);
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

  async fields(auth: JiraAuth): Promise<JiraFieldInfo[]> {
    return fieldsOf(await this.get(auth, '/field'));
  }

  async issue(auth: JiraAuth, key: string): Promise<JiraIssue> {
    const path = `/issue/${encodeURIComponent(key)}?fields=${ISSUE_FIELDS}`;
    return issueOf(await this.get(auth, path));
  }

  async transitions(auth: JiraAuth, key: string): Promise<JiraTransition[]> {
    return transitionsOf(await this.get(auth, `${issuePath(key)}/transitions`));
  }

  async transitionIssue(auth: JiraAuth, key: string, transitionId: string): Promise<void> {
    const body = { transition: { id: transitionId } };
    await this.get(auth, `${issuePath(key)}/transitions`, { method: 'POST', body });
  }

  async issueStatus(auth: JiraAuth, key: string): Promise<{ id: string; name: string }> {
    return statusOf(await this.get(auth, `${issuePath(key)}?fields=status`));
  }

  async editMeta(auth: JiraAuth, key: string): Promise<Record<string, JiraEditField>> {
    return editMetaOf(await this.get(auth, `${issuePath(key)}/editmeta`));
  }

  async updateIssue(
    auth: JiraAuth,
    key: string,
    change: { fields: Record<string, unknown>; update: Record<string, unknown> },
  ): Promise<void> {
    await this.get(auth, issuePath(key), { method: 'PUT', body: change });
  }

  async addComment(auth: JiraAuth, key: string, body: AdfDocument): Promise<void> {
    await this.get(auth, `${issuePath(key)}/comment`, { method: 'POST', body: { body } });
  }

  async comments(auth: JiraAuth, key: string): Promise<JiraCommentPage> {
    const site = jiraSiteOf(auth.site) ?? auth.site;
    const comments: JiraComment[] = [];
    let total = 0;
    // Newest first, so a long issue keeps its latest comments; shown oldest first.
    for (let page = 0; page < MAX_COMMENT_PAGES; page += 1) {
      const query = `orderBy=-created&startAt=${page * COMMENTS_PER_PAGE}&maxResults=${COMMENTS_PER_PAGE}`;
      // Pages follow one another: each starts where the one before ended.
      // oxlint-disable-next-line no-await-in-loop
      const body = await this.get(auth, `${issuePath(key)}/comment?${query}`);
      const read = commentPageOf(body, site, key);
      comments.push(...read.comments);
      ({ total } = read);
      if (read.comments.length < COMMENTS_PER_PAGE || comments.length >= total) {
        break;
      }
    }
    return { comments: comments.toReversed(), total: Math.max(total, comments.length) };
  }

  async attachmentMediaId(auth: JiraAuth, attachmentId: string): Promise<string | null> {
    const path = `/attachment/content/${encodeURIComponent(attachmentId)}`;
    const response = await this.request(auth, path, 'manual');
    // Only the redirect's address is read: the file itself is downloaded when the ticket is created.
    await response.body?.cancel();
    return mediaIdOf(response.headers.get('location'));
  }
}
