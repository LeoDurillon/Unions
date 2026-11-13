// Jira Cloud as a `TrackerAdapter`: its provider, issues named by key or by a link of the site, their comments.

import type { JiraApi } from './jira-api';
import { jiraConfigOf } from './jira-config';
import { jiraKeysIn } from './jira-keys';
import { jiraAccess, jiraProvider } from './jira-provider';
import { jiraPostFailure, jiraThreads, postJiraThreadComment } from './jira-threads';
import { integrationKind } from './kinds';
import type { TrackerAdapter } from './tracker-adapter';

export function jiraAdapter(jira: JiraApi): TrackerAdapter {
  const kind = integrationKind('jira');
  return {
    ...jiraProvider(jira),
    kind: 'jira',
    refs: {
      parse: (input) => kind.parseRef(input),
      error: (input, config) => kind.refError?.(input, config) ?? null,
      namedIn: (texts, config) => {
        const { projectKey, site } = jiraConfigOf(config);
        return jiraKeysIn(texts, projectKey, site);
      },
    },
    // The provider converts an issue's ADF to markdown already.
    text: { markdown: (raw) => kind.cleanMarkdown(raw) },
    comments: {
      read: (token, config, key) => jiraThreads(jira, jiraAccess(token, config).auth, key),
      post: (token, config, post) =>
        postJiraThreadComment(jira, jiraAccess(token, config).auth, post),
      postFailure: (error) => jiraPostFailure(error),
    },
  };
}
