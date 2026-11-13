// Jira's "Comment on the ticket's issue" rule action as it runs: its text filled in, sent as Jira's rich text.

import type { DeliveryOutcome } from '../event/delivery-outcome';
import { renderTemplate } from '../event/event-rule-types';
import type { TrackerActionOf } from '../event/event-tracker-actions';
import { clipDetail } from '../union/notifications';
import type { JiraApi } from './jira-api';
import { jiraRuleFailure } from './jira-rule-failure';
import type { JiraIssueTarget } from './jira-rule-send';
import { textAdf } from './text-adf';

export async function commentJiraRule(
  jira: JiraApi,
  target: JiraIssueTarget,
  action: TrackerActionOf<'tracker_comment'>,
): Promise<DeliveryOutcome> {
  const text = renderTemplate(action.body, target.values).trim();
  if (text === '') {
    return { status: 'failed', error: 'The comment is empty once its variables are filled in' };
  }
  try {
    await jira.addComment(target.auth, target.key, textAdf(text));
    return { status: 'succeeded', detail: `Commented on ${target.key}: ${clipDetail(text)}` };
  } catch (error) {
    return jiraRuleFailure(error, 'Add comments', `comment on ${target.key}`);
  }
}
