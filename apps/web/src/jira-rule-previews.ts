// What a rule's Jira action would do for one ticket's issue, its templates filled in; nothing is sent and Jira is not
// called, so the workflow and a select's options are checked only when the rule runs.
import {
  jiraFieldValue,
  renderTemplate,
  templateValues,
  type Db,
  type JiraCommentAction,
  type JiraFieldAction,
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

const NOT_FROM_JIRA: RulePreview = { ok: false, error: 'This ticket was not imported from Jira' };

function fieldLines(action: JiraFieldAction, values: Values): string[] | { error: string } {
  const lines: string[] = [];
  for (const entry of action.values) {
    const text = renderTemplate(entry.value, values).trim();
    const shaped = jiraFieldValue(entry.fieldType, text);
    if ('error' in shaped) {
      return { error: `${entry.fieldName}: ${shaped.error}` };
    }
    lines.push(
      'add' in shaped
        ? `${entry.fieldName}: add ${shaped.add.join(', ')}`
        : `${entry.fieldName} to ${text === '' ? '(empty)' : text}`,
    );
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
  const options = action.values.some((entry) => entry.fieldType === 'option');
  return {
    ok: true,
    kind: 'jira',
    key,
    title: `Would set on ${key}:`,
    lines,
    text: null,
    note: options
      ? "Options are checked against the issue's edit screen when the rule runs."
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
