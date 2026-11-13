// In-memory Jira Cloud for tests: one project and its issues; the calls it does not hold reject.

import type { JiraApi } from './jira-api';
import { JiraError } from './jira-error';
import type { JiraIssue } from './jira-parse';

const NOT_FOUND = 404;

function missing(): Promise<never> {
  return Promise.reject(new JiraError('Not found', NOT_FOUND));
}

function unsupported(): Promise<never> {
  return Promise.reject(new Error('Not in the fake Jira'));
}

export function fakeJiraApi(
  project: { key: string; name: string },
  issues: readonly JiraIssue[],
): JiraApi {
  return {
    myself: () => Promise.resolve({ accountId: '557058:fake', displayName: 'Fake' }),
    project: (_auth, key) =>
      key === project.key ? Promise.resolve({ ...project, issueTypes: [] }) : missing(),
    statuses: () => Promise.resolve([]),
    fields: () => Promise.resolve([]),
    issue: (_auth, key) => {
      const issue = issues.find((candidate) => candidate.key === key);
      return issue ? Promise.resolve(issue) : missing();
    },
    transitions: () => Promise.resolve([]),
    transitionIssue: unsupported,
    issueStatus: unsupported,
    editMeta: () => Promise.resolve({}),
    updateIssue: unsupported,
    createIssue: unsupported,
    addComment: unsupported,
    attachmentMediaId: () => Promise.resolve(null),
    comments: () => Promise.resolve({ comments: [], total: 0 }),
    read: unsupported,
  };
}
