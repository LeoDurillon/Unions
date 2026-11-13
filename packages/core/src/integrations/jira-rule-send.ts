// Jira's rule actions as they run: move each issue through its workflow, set its fields, or comment on it.
// One issue after the other, the first that does not succeed being the outcome; Jira's failures become outcomes.

import type { DeliveryOutcome } from '../event/delivery-outcome';
import type { TrackerAction, TrackerActionOf } from '../event/event-tracker-actions';
import type { JiraApi, JiraAuth } from './jira-api';
import { readJiraConfig } from './jira-config';
import { commentJiraRule } from './jira-rule-comment';
import { jiraRuleFailure } from './jira-rule-failure';
import { deliverJiraFields } from './jira-rule-fields';
import type { TrackerAccess } from './tracker-fields';
import type { RuleRun, RuleValues } from './tracker-rules';

/** The issue an action acts on, who calls, and the rule's variables filled in for this event. */
export type JiraIssueTarget = { auth: JiraAuth; key: string; values: RuleValues };

async function moveOnce(
  jira: JiraApi,
  { auth, key }: JiraIssueTarget,
  action: TrackerActionOf<'tracker_status'>,
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

async function move(
  jira: JiraApi,
  target: JiraIssueTarget,
  action: TrackerActionOf<'tracker_status'>,
): Promise<DeliveryOutcome> {
  try {
    return await moveOnce(jira, target, action);
  } catch (error) {
    return jiraRuleFailure(
      error,
      'Transition issues',
      `move ${target.key} to ${action.statusName}`,
    );
  }
}

function deliverOne(
  jira: JiraApi,
  target: JiraIssueTarget,
  action: TrackerAction,
): Promise<DeliveryOutcome> {
  if (action.kind === 'tracker_status') {
    return move(jira, target, action);
  }
  if (action.kind === 'tracker_fields') {
    return deliverJiraFields(jira, target, action);
  }
  return commentJiraRule(jira, target, action);
}

/**
 * Runs the action on each issue in turn; the first that does not succeed is the delivery's outcome
 * (a retry runs them all again, which changes nothing on those done: a move already there is left).
 */
export async function deliverJiraRule(
  jira: JiraApi,
  access: TrackerAccess,
  { itemIds, action, values }: RuleRun,
): Promise<DeliveryOutcome> {
  const config = readJiraConfig(access.config);
  if ('error' in config) {
    return { status: 'failed', error: 'The project is not connected to Jira' };
  }
  const auth = { site: config.config.site, email: config.config.email, token: access.secret };
  const details: string[] = [];
  for (const key of itemIds) {
    // One issue after the other: Jira limits the account's requests.
    const outcome = await deliverOne(jira, { auth, key, values }, action);
    if (outcome.status !== 'succeeded') {
      return outcome;
    }
    details.push(outcome.detail);
  }
  return { status: 'succeeded', detail: details.join('; ') };
}
