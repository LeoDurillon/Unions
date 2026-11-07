// The "Comment on the ticket's Jira issue" action of a rule: its text filled in, sent as Jira's rich text.
import {
  clipDetail,
  renderTemplate,
  textAdf,
  type DeliveryOutcome,
  type JiraApi,
  type JiraCommentAction,
} from '@union/core';

import { jiraFailure, type JiraIssueTarget } from './jira-target';

export async function deliverJiraComment(
  jira: JiraApi,
  target: JiraIssueTarget | DeliveryOutcome,
  action: JiraCommentAction,
): Promise<DeliveryOutcome> {
  if ('status' in target) {
    return target;
  }
  const text = renderTemplate(action.body, target.values).trim();
  if (text === '') {
    return { status: 'failed', error: 'The comment is empty once its variables are filled in' };
  }
  try {
    await jira.addComment(target.auth, target.key, textAdf(text));
    return { status: 'succeeded', detail: `Commented on ${target.key}: ${clipDetail(text)}` };
  } catch (error) {
    return jiraFailure(error, 'Add comments', `comment on ${target.key}`);
  }
}
