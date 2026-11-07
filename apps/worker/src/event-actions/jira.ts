// The Jira actions of rules (move the ticket's issue, set its fields, comment on it), each a target of the dispatcher.
import type { Db, JiraApi } from '@union/core';

import { deliverJiraComment } from './jira-comment';
import { deliverJiraFields } from './jira-field';
import { eachIssue, JIRA_PER_TICK, jiraIssueOf } from './jira-target';
import { deliverJiraTransition } from './jira-transition';
import type { ActionTargets } from './target';

export function jiraTargets(
  db: Db,
  jira: JiraApi,
): Pick<ActionTargets, 'jira_transition' | 'jira_field' | 'jira_comment'> {
  return {
    jira_transition: {
      perTick: JIRA_PER_TICK,
      deliver: (due, action) =>
        eachIssue(jiraIssueOf(db, due), (target) => deliverJiraTransition(jira, target, action)),
    },
    jira_field: {
      perTick: JIRA_PER_TICK,
      deliver: (due, action) =>
        eachIssue(jiraIssueOf(db, due), (target) => deliverJiraFields(jira, target, action)),
    },
    jira_comment: {
      perTick: JIRA_PER_TICK,
      deliver: (due, action) =>
        eachIssue(jiraIssueOf(db, due), (target) => deliverJiraComment(jira, target, action)),
    },
  };
}
