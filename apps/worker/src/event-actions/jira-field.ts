// The "Set fields of the ticket's Jira issue" action of a rule: values filled in, checked, then
// sent in one request. They are checked against the issue's edit screen; labels are added, the
// other fields set, picked ones resolved first.
import {
  isPickedType,
  jiraFieldValue,
  renderTemplate,
  type DeliveryOutcome,
  type JiraApi,
  type JiraFieldAction,
} from '@union/core';

import { pickedValue } from './jira-field-picks';
import { jiraFailure, type JiraIssueTarget } from './jira-target';

type Entry = JiraFieldAction['values'][number];
/** One field as it is sent, and as the delivery says it. */
type Prepared = { entry: Entry; text: string; value: { set: unknown } | { add: string[] } };
type Change = { fields: Record<string, unknown>; update: Record<string, unknown> };

/** One value filled in (or its picks resolved) and shaped for its type, or why it cannot be. */
async function prepareOne(
  jira: JiraApi,
  target: JiraIssueTarget,
  entry: Entry,
): Promise<Prepared | { error: string }> {
  const type = entry.fieldType;
  if (isPickedType(type)) {
    return { entry, ...(await pickedValue(jira, target, { ...entry, fieldType: type })) };
  }
  const text = renderTemplate(entry.value, target.values);
  const value = jiraFieldValue(type, text);
  return 'error' in value
    ? { error: `${entry.fieldName}: ${value.error}` }
    : { entry, text: text.trim(), value };
}

/** Each value shaped for its type; the first one that cannot be fails the delivery. */
async function prepare(
  jira: JiraApi,
  action: JiraFieldAction,
  target: JiraIssueTarget,
): Promise<Prepared[] | { error: string }> {
  const all = await Promise.all(action.values.map((entry) => prepareOne(jira, target, entry)));
  const failed = all.find((each) => 'error' in each);
  return failed && 'error' in failed ? failed : all.filter((each) => 'entry' in each);
}

/** The option names a value gives: one for a select, several for a multi-select. */
function optionNames(entry: Entry, text: string): string[] {
  if (entry.fieldType === 'option') {
    return text === '' ? [] : [text];
  }
  return entry.fieldType === 'multi_option'
    ? text
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
    : [];
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
    const unknown = optionNames(entry, text).find((name) => options && !options.includes(name));
    if (options && unknown !== undefined) {
      return `${entry.fieldName}: "${unknown}" is not one of its options (${options.join(', ')})`;
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
  const prepared = await prepare(jira, action, target).catch((error: unknown) =>
    // Reading the board's sprints failed: no board, no active sprint, or Jira refused.
    jiraFailure(error, 'Browse projects', action.values.map((entry) => entry.fieldName).join(', ')),
  );
  if ('status' in prepared) {
    return prepared;
  }
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
