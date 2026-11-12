// What a rule's Jira action would do for one ticket's issue, its templates filled in. Nothing is
// sent and Jira is not called, so the workflow and a select's options are checked only when the
// rule runs.
import {
  isPickedType,
  jiraFieldValue,
  renderTemplate,
  templateValues,
  type Db,
  type JiraCommentAction,
  type JiraFieldAction,
  type JiraFieldType,
  type JiraTypedType,
  type JiraTransitionAction,
  type Project,
  type Ticket,
} from '@union/core';

import type { RulePreview } from './event-api-types';

type Values = ReturnType<typeof templateValues>;

/** The ticket's issue key, or why the action does not apply to it. */
function issueKey(ticket: Ticket): string | null {
  return ticket.originKind === 'jira' && ticket.originId ? ticket.originId : null;
}

/** Options are checked against the issue's edit screen, sprints resolved on the board, when the rule runs. */
const CHECKED_WHEN_RUN = new Set<JiraFieldType>(['option', 'multi_option', 'sprint']);

const NOT_FROM_JIRA: RulePreview = { ok: false, error: 'This ticket was not imported from Jira' };

type Entry = JiraFieldAction['values'][number];

/** A typed value filled in and shaped, as the preview says it; why it cannot be, else. */
function typedLine(entry: Entry, type: JiraTypedType, values: Values): string | { error: string } {
  const text = renderTemplate(entry.value, values).trim();
  const shaped = jiraFieldValue(type, text);
  if ('error' in shaped) {
    return { error: `${entry.fieldName}: ${shaped.error}` };
  }
  return 'add' in shaped
    ? `${entry.fieldName}: add ${shaped.add.join(', ')}`
    : `${entry.fieldName} to ${text === '' ? '(empty)' : text}`;
}

function fieldLines(action: JiraFieldAction, values: Values): string[] | { error: string } {
  const lines: string[] = [];
  for (const entry of action.values) {
    const type = entry.fieldType;
    // A picked value's names are its sentence.
    const line = isPickedType(type)
      ? `${entry.fieldName} to ${entry.value === '' ? '(empty)' : entry.value}`
      : typedLine(entry, type, values);
    if (typeof line !== 'string') {
      return line;
    }
    lines.push(line);
  }
  return lines;
}

export function jiraTransitionPreview(
  _db: Db,
  _project: Project,
  ticket: Ticket,
  action: JiraTransitionAction,
): RulePreview {
  const key = issueKey(ticket);
  if (key === null) {
    return NOT_FROM_JIRA;
  }
  return {
    ok: true,
    kind: 'jira',
    key,
    title: `Would move ${key} to ${action.statusName}`,
    lines: [],
    text: null,
    note: "The transition is found in the issue's workflow when the rule runs.",
  };
}

export function jiraFieldPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: JiraFieldAction,
): RulePreview {
  const key = issueKey(ticket);
  if (key === null) {
    return NOT_FROM_JIRA;
  }
  const lines = fieldLines(action, templateValues(project, ticket, null));
  if ('error' in lines) {
    return { ok: false, error: lines.error };
  }
  const checked = action.values.some((entry) => CHECKED_WHEN_RUN.has(entry.fieldType));
  return {
    ok: true,
    kind: 'jira',
    key,
    title: `Would set on ${key}:`,
    lines,
    text: null,
    note: checked
      ? 'Options and sprints are checked against the issue and its board when the rule runs.'
      : null,
  };
}

export function jiraCommentPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: JiraCommentAction,
): RulePreview {
  const key = issueKey(ticket);
  if (key === null) {
    return NOT_FROM_JIRA;
  }
  const text = renderTemplate(action.body, templateValues(project, ticket, null)).trim();
  return {
    ok: true,
    kind: 'jira',
    key,
    title: `Would comment on ${key}:`,
    lines: [],
    text,
    note: null,
  };
}
