// What a Jira rule action would do on one issue, its templates filled in. Nothing is sent and Jira is not called,
// so the workflow and a select's options are checked only when the rule runs.

import { renderTemplate } from '../event/event-rule-types';
import type { TrackerAction, TrackerRuleValue } from '../event/event-tracker-actions';
import { isJiraFieldType, isPickedType, type JiraFieldType } from './jira-field-types';
import { jiraFieldValue } from './jira-values';
import type { RulePreviewText, RuleValues } from './tracker-rules';

type Values = RuleValues;

/** Options are checked against the issue's edit screen, sprints resolved on the board, when the rule runs. */
const CHECKED_WHEN_RUN = new Set<string>(['option', 'multi_option', 'sprint']);

/** A value filled in and shaped, as the preview says it; why it cannot be, else. */
function fieldLine(entry: TrackerRuleValue, values: Values): string | { error: string } {
  const type: JiraFieldType | null = isJiraFieldType(entry.fieldType) ? entry.fieldType : null;
  if (type === null) {
    return { error: `${entry.fieldName}: Union cannot set this field any more` };
  }
  // A picked value's names are its sentence.
  if (isPickedType(type)) {
    return `${entry.fieldName} to ${entry.value === '' ? '(empty)' : entry.value}`;
  }
  const text = renderTemplate(entry.value, values).trim();
  const shaped = jiraFieldValue(type, text);
  if ('error' in shaped) {
    return { error: `${entry.fieldName}: ${shaped.error}` };
  }
  return 'add' in shaped
    ? `${entry.fieldName}: add ${shaped.add.join(', ')}`
    : `${entry.fieldName} to ${text === '' ? '(empty)' : text}`;
}

function fieldsPreview(
  key: string,
  entries: readonly TrackerRuleValue[],
  values: Values,
): RulePreviewText | { error: string } {
  const lines: string[] = [];
  for (const entry of entries) {
    const line = fieldLine(entry, values);
    if (typeof line !== 'string') {
      return line;
    }
    lines.push(line);
  }
  const checked = entries.some((entry) => CHECKED_WHEN_RUN.has(entry.fieldType));
  return {
    title: `Would set on ${key}:`,
    lines,
    text: null,
    note: checked
      ? 'Options and sprints are checked against the issue and its board when the rule runs.'
      : null,
  };
}

export function previewJiraRule(
  action: TrackerAction,
  key: string,
  values: Values,
): RulePreviewText | { error: string } {
  if (action.kind === 'tracker_status') {
    return {
      title: `Would move ${key} to ${action.statusName}`,
      lines: [],
      text: null,
      note: "The transition is found in the issue's workflow when the rule runs.",
    };
  }
  if (action.kind === 'tracker_fields') {
    return fieldsPreview(key, action.values, values);
  }
  const text = renderTemplate(action.body, values).trim();
  return { title: `Would comment on ${key}:`, lines: [], text, note: null };
}
