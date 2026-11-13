// Jira Cloud as a `TrackerAdapter`: its provider, issues by key or by link, their comments, fields, files and rules.

import type { JiraApi } from './jira-api';
import { jiraFieldsCapability } from './jira-fields-capability';
import { jiraFiles } from './jira-files';
import { jiraText } from './jira-item-text';
import { jiraProvider } from './jira-provider';
import { jiraRefs } from './jira-refs';
import { deliverJiraRule } from './jira-rule-send';
import { jiraComments } from './jira-threads';
import type { TrackerAdapter } from './tracker-adapter';
import { trackerRuleChecks } from './tracker-rules';

/** Jira Cloud limits requests per user, and a move is two or three of them. */
const JIRA_PER_TICK = 2;

export function jiraAdapter(jira: JiraApi): TrackerAdapter {
  return {
    ...jiraProvider(jira),
    kind: 'jira',
    refs: jiraRefs(jira),
    text: jiraText(jira),
    comments: jiraComments(jira),
    fields: jiraFieldsCapability(jira),
    files: jiraFiles,
    rules: {
      ...trackerRuleChecks('jira'),
      perTick: JIRA_PER_TICK,
      deliver: (access, run) => deliverJiraRule(jira, access, run),
    },
  };
}
