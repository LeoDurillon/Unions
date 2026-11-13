// In-memory Jira Cloud for tests: one project, its issues and their comments; the calls it does not hold reject.

import type { AdfRichDocument } from './adf-types';
import type { JiraApi } from './jira-api';
import { commentPageOf } from './jira-comments';
import { JiraError } from './jira-error';
import type { JiraIssue } from './jira-parse';

const NOT_FOUND = 404;
/** Ids of posted comments start here, above those a test seeds. */
const FIRST_ID = 90_000;
/** Posted comments are a minute apart from this time on. */
const POSTED_FROM = Date.parse('2026-01-01T00:00:00.000Z');
const MINUTE = 60_000;

/** A comment as Jira's REST API answers it. */
type FakeJiraComment = {
  id: string;
  author: { displayName: string; accountId?: string };
  created: string;
  updated?: string;
  body: unknown;
  visibility?: { type: string; value: string };
};

function missing(): Promise<never> {
  return Promise.reject(new JiraError('Not found', NOT_FOUND));
}

function unsupported(): Promise<never> {
  return Promise.reject(new Error('Not in the fake Jira'));
}

/** What a test gives the fake beside its issues: their comments, their fields (`GET /issue` with `editmeta`). */
export type FakeJiraData = {
  comments?: Record<string, FakeJiraComment[]>;
  bodies?: Record<string, unknown>;
  /** The changes sent: field updates and transitions. */
  updates?: { key: string; change: unknown }[];
};

const ISSUE_PATH = /^\/issue\/(?<key>[^?]+)/u;

/** The field updates and transitions, recorded. */
function writes(
  updates: { key: string; change: unknown }[],
): Pick<JiraApi, 'transitionIssue' | 'updateIssue'> {
  return {
    transitionIssue: (_auth, key, transitionId) => {
      updates.push({ key, change: { transitionId } });
      return Promise.resolve();
    },
    updateIssue: (_auth, key, change) => {
      updates.push({ key, change });
      return Promise.resolve();
    },
  };
}

/** Comments are kept by issue key, so a test reads back what it posted. */
export function fakeJiraApi(
  project: { key: string; name: string; site: string },
  issues: readonly JiraIssue[],
  data: FakeJiraData = {},
): JiraApi {
  const comments = data.comments ?? {};
  const updates = data.updates ?? [];
  let next = 0;
  const issue = (key: string): JiraIssue | undefined =>
    issues.find((candidate) => candidate.key === key);
  const addComment = (key: string, body: AdfRichDocument): Promise<{ id: string }> => {
    if (!issue(key)) {
      return missing();
    }
    next += 1;
    const created = new Date(POSTED_FROM + next * MINUTE).toISOString();
    const id = `${FIRST_ID + next}`;
    comments[key] = [
      ...(comments[key] ?? []),
      { id, author: { displayName: 'Union', accountId: 'union' }, created, body },
    ];
    return Promise.resolve({ id });
  };
  return {
    myself: () => Promise.resolve({ accountId: '557058:fake', displayName: 'Fake' }),
    project: (_auth, key) =>
      key === project.key
        ? Promise.resolve({ key, name: project.name, issueTypes: [] })
        : missing(),
    statuses: () => Promise.resolve([]),
    fields: () => Promise.resolve([]),
    issue: (_auth, key) => {
      const found = issue(key);
      return found ? Promise.resolve(found) : missing();
    },
    transitions: () => Promise.resolve([]),
    ...writes(updates),
    issueStatus: unsupported,
    editMeta: () => Promise.resolve({}),
    createIssue: unsupported,
    addComment: (_auth, key, body) => addComment(key, body),
    attachmentMediaId: () => Promise.resolve(null),
    comments: (_auth, key) => {
      const list = comments[key] ?? [];
      return issue(key)
        ? Promise.resolve(commentPageOf({ comments: list, total: list.length }, project.site, key))
        : missing();
    },
    read: (_auth, path) => {
      const key = decodeURIComponent(ISSUE_PATH.exec(path)?.groups?.key ?? '');
      const body = data.bodies?.[key];
      return body === undefined ? missing() : Promise.resolve(body);
    },
  };
}
