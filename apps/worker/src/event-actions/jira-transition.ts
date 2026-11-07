// The "Move the ticket's Jira issue" action of a rule: the transition of its workflow that leads to the rule's status.
import type { DeliveryOutcome, JiraApi, JiraTransitionAction } from '@union/core';

import { jiraFailure, type JiraIssueTarget } from './jira-target';

async function move(
  jira: JiraApi,
  { auth, key }: JiraIssueTarget,
  action: JiraTransitionAction,
): Promise<DeliveryOutcome> {
  // An issue already there is left alone: a transition to its own status would only add history.
  const current = await jira.issueStatus(auth, key);
  if (current.id === action.statusId) {
    return { status: 'succeeded', detail: `${key} is already ${action.statusName}` };
  }
  const transitions = await jira.transitions(auth, key);
  const transition = transitions.find((candidate) => candidate.toId === action.statusId);
  if (!transition) {
    return {
      status: 'failed',
      error: `No transition from ${current.name} to ${action.statusName} in the issue's workflow`,
    };
  }
  await jira.transitionIssue(auth, key, transition.id);
  return {
    status: 'succeeded',
    detail: `Moved ${key} from ${current.name} to ${action.statusName}`,
  };
}

export async function deliverJiraTransition(
  jira: JiraApi,
  target: JiraIssueTarget | DeliveryOutcome,
  action: JiraTransitionAction,
): Promise<DeliveryOutcome> {
  if ('status' in target) {
    return target;
  }
  try {
    return await move(jira, target, action);
  } catch (error) {
    return jiraFailure(error, 'Transition issues', `move ${target.key} to ${action.statusName}`);
  }
}
