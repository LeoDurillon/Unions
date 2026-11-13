// What a rule's Jira fields action sets, as the rule's sentence ends: "set on the Jira issue: Points to 3".
import type { TrackerActionOf, TrackerRuleValue } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

function fieldText({ fieldName, fieldType, value }: TrackerRuleValue): string {
  if (fieldType === 'labels') {
    return `add ${value} to ${fieldName}`;
  }
  return `${fieldName} to ${value === '' ? '(empty)' : value}`;
}

export function JiraFieldsText({
  action,
}: {
  action: TrackerActionOf<'tracker_fields'>;
}): ReactElement {
  return <>set on the Jira issue: {action.values.map((entry) => fieldText(entry)).join(', ')}</>;
}
