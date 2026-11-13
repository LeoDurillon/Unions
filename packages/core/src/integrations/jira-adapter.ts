// Jira Cloud as a `TrackerAdapter`: its provider, issues by key or by link, their comments, fields and rules.

import type { JiraApi } from './jira-api';
import { jiraConfigOf } from './jira-config';
import { jiraFieldsCapability } from './jira-fields-capability';
import { jiraKeysIn } from './jira-keys';
import { jiraAccess, jiraProvider } from './jira-provider';
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
    refs: {
      parse: (input) => kind.parseRef(input),
      error: (input, config) => kind.refError?.(input, config) ?? null,
      namedIn: (texts, config) => {
        const { projectKey, site } = jiraConfigOf(config);
        return jiraKeysIn(texts, projectKey, site);
      },
      check: async (secret, config, key) => {
        const item = await jiraProvider(jira).item(secret, config, key);
        return { itemId: item.id, title: item.title || item.id, url: item.url };
      },
      url: (key, config) => `${jiraConfigOf(config).site}/browse/${key}`,
    },
    // The provider converts an issue's ADF to markdown already.
    text: { markdown: (raw) => kind.cleanMarkdown(raw) },
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
