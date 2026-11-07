// What a rule's Jira action does, as the rule's sentence ends: "move the Jira issue to In Review".
import type { EventAction } from '@union/core/event-actions';
import type { ReactElement } from 'react';

type JiraAction = Extract<EventAction, { kind: 'jira_transition' | 'jira_field' | 'jira_comment' }>;

export function isJiraAction(action: EventAction): action is JiraAction {
  return (
    action.kind === 'jira_transition' ||
    action.kind === 'jira_field' ||
    action.kind === 'jira_comment'
  );
}

function fieldText({
  fieldName,
  fieldType,
  value,
}: Extract<JiraAction, { kind: 'jira_field' }>['values'][number]): string {
  if (fieldType === 'labels') {
    return `add ${value} to ${fieldName}`;
  }
  return `${fieldName} to ${value === '' ? '(empty)' : value}`;
}

export function JiraActionText({ action }: { action: JiraAction }): ReactElement {
  if (action.kind === 'jira_transition') {
    return <>move the Jira issue to {action.statusName}</>;
  }
  if (action.kind === 'jira_field') {
    return <>set on the Jira issue: {action.values.map((entry) => fieldText(entry)).join(', ')}</>;
  }
  return (
    <>
      comment on the Jira issue: <code className="font-mono">{action.body}</code>
    </>
  );
}
