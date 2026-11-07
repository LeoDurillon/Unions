// The "Set fields of the ticket's Jira issue" action of a rule: its values filled in, checked against the issue's edit
// screen, then sent in one request (labels added, the other fields set).
import {
  jiraFieldValue,
  renderTemplate,
  type DeliveryOutcome,
  type JiraApi,
  type JiraFieldAction,
} from '@union/core';

import { jiraFailure, type JiraIssueTarget } from './jira-target';

type Entry = JiraFieldAction['values'][number];
/** One field as it is sent, and as the delivery says it. */
type Prepared = { entry: Entry; text: string; value: { set: unknown } | { add: string[] } };
type Change = { fields: Record<string, unknown>; update: Record<string, unknown> };

/** Each value filled in and shaped for its type; the first one that cannot be fails the delivery. */
function prepare(action: JiraFieldAction, target: JiraIssueTarget): Prepared[] | { error: string } {
  const prepared: Prepared[] = [];
  for (const entry of action.values) {
    const text = renderTemplate(entry.value, target.values);
    const value = jiraFieldValue(entry.fieldType, text);
    if ('error' in value) {
      return { error: `${entry.fieldName}: ${value.error}` };
    }
    prepared.push({ entry, text: text.trim(), value });
  }
  return prepared;
}

/** Why the issue's edit screen refuses a value: the field is not on it, or an option is not one of its own. */
function screenError(
  prepared: Prepared[],
  meta: Awaited<ReturnType<JiraApi['editMeta']>>,
): string | null {
  for (const { entry, text } of prepared) {
    const field = meta[entry.fieldId];
    if (!field) {
      return `${entry.fieldName} is not on the issue's edit screen`;
    }
    const options = field.allowedValues;
    if (entry.fieldType === 'option' && text !== '' && options && !options.includes(text)) {
      return `${entry.fieldName}: "${text}" is not one of its options (${options.join(', ')})`;
    }
  }
  return null;
}

function changeOf(prepared: Prepared[]): Change {
  const change: Change = { fields: {}, update: {} };
  for (const { entry, value } of prepared) {
    if ('add' in value) {
      change.update[entry.fieldId] = value.add.map((label) => ({ add: label }));
    } else {
      change.fields[entry.fieldId] = value.set;
    }
  }
  return change;
}

/** What a delivery says it did: `PR link set to "https://…", Labels: added qa`. */
function describe(prepared: Prepared[]): string {
  return prepared
    .map(({ entry, text, value }) =>
      'add' in value
        ? `${entry.fieldName}: added ${value.add.join(', ')}`
        : `${entry.fieldName} set to ${text === '' ? '(empty)' : `"${text}"`}`,
    )
    .join(', ');
}

export async function deliverJiraFields(
  jira: JiraApi,
  target: JiraIssueTarget | DeliveryOutcome,
  action: JiraFieldAction,
): Promise<DeliveryOutcome> {
  if ('status' in target) {
    return target;
  }
  const prepared = prepare(action, target);
  if ('error' in prepared) {
    return { status: 'failed', error: prepared.error };
  }
  const detail = describe(prepared);
  try {
    const refused = screenError(prepared, await jira.editMeta(target.auth, target.key));
    if (refused !== null) {
      return { status: 'failed', error: refused, detail: `Tried: ${detail}` };
    }
    await jira.updateIssue(target.auth, target.key, changeOf(prepared));
    return { status: 'succeeded', detail: `${target.key}: ${detail}` };
  } catch (error) {
    return jiraFailure(error, 'Edit issues', detail);
  }
}
