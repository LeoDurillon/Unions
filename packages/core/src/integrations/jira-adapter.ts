// Jira Cloud as a `TrackerAdapter`: its provider, issues by key or by link, their comments, fields and rules.

import type { JiraApi } from './jira-api';
import { jiraFieldsCapability } from './jira-fields-capability';
import { readJiraText } from './jira-item-text';
import { jiraAccess, jiraProvider } from './jira-provider';
import { jiraRefs } from './jira-refs';
import { deliverJiraRule } from './jira-rule-send';
import { jiraPostFailure, jiraThreads, postJiraThreadComment } from './jira-threads';
import { integrationKind } from './kinds';
import type { TrackerAdapter } from './tracker-adapter';
import { trackerRuleChecks } from './tracker-rules';

/** Jira Cloud limits requests per user, and a move is two or three of them. */
const JIRA_PER_TICK = 2;

export function jiraAdapter(jira: JiraApi): TrackerAdapter {
  const kind = integrationKind('jira');
  return {
    ...jiraProvider(jira),
    kind: 'jira',
    refs: jiraRefs(jira),
    // The provider converts an issue's ADF to markdown already.
    text: {
      markdown: (raw) => kind.cleanMarkdown(raw),
      read: (secret, config, key) => readJiraText(jira, jiraAccess(secret, config).auth, key),
    },
    comments: {
      read: (token, config, key) => jiraThreads(jira, jiraAccess(token, config).auth, key),
      post: (token, config, post) =>
        postJiraThreadComment(jira, jiraAccess(token, config).auth, post),
      postFailure: (error) => jiraPostFailure(error),
    },
    fields: jiraFieldsCapability(jira),
    rules: {
      ...trackerRuleChecks('jira'),
      perTick: JIRA_PER_TICK,
      deliver: (access, run) => deliverJiraRule(jira, access, run),
    },
  };
}
