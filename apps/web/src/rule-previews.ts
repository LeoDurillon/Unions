// What a rule's action would do for one ticket, one preview per kind of action; nothing is sent.
import {
  clipDetail,
  describeChange,
  notionSchemaOf,
  notionSets,
  renderTemplate,
  templateValues,
  type ActionKind,
  type ActionOf,
  type Db,
  type GitHubCommentAction,
  type GitHubProjectFieldsAction,
  type GitHubPullRequestAction,
  type NotionPropertyAction,
  type Project,
  type Ticket,
  type UnionNotificationAction,
} from '@union/core';

import type { RulePreview } from './event-api-types';

function notionPreview(
  db: Db,
  project: Project,
  ticket: Ticket,
  action: NotionPropertyAction,
): RulePreview {
  const pageId = ticket.originKind === 'notion' ? ticket.originId : null;
  if (!pageId) {
    return { ok: false, error: 'This ticket was not imported from Notion' };
  }
  const properties = notionSchemaOf(db, project.id)?.properties ?? [];
  const sets = notionSets(properties, action, templateValues(project, ticket, null));
  return 'error' in sets
    ? { ok: false, error: sets.error }
    : {
        ok: true,
        kind: 'notion_property',
        pageId,
        properties: sets.sets.map(({ property, text, value }) => ({
          name: property.name,
          text,
          value,
        })),
      };
}

type Previews = {
  [K in ActionKind]: (db: Db, project: Project, ticket: Ticket, action: ActionOf<K>) => RulePreview;
};

function gitHubCommentPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: GitHubCommentAction,
): RulePreview {
  const number = action.on === 'issue' ? ticket.issueNumber : ticket.prNumber;
  if (number === null) {
    const missing = action.on === 'issue' ? 'issue' : 'pull request';
    return { ok: false, error: `This ticket has no ${missing} yet` };
  }
  const text = renderTemplate(action.body, templateValues(project, ticket, null));
  return { ok: true, kind: 'github_comment', on: action.on, number, text };
}

/** The notification as the bell would show it: the ticket's title, the message filled in. */
function unionNotificationPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: UnionNotificationAction,
): RulePreview {
  const text = clipDetail(renderTemplate(action.message, templateValues(project, ticket, null)));
  return { ok: true, kind: 'union_notification', title: ticket.title, text };
}

/** The changes as they would be made, templates filled in; nothing is sent. */
function gitHubPullRequestPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: GitHubPullRequestAction,
): RulePreview {
  if (ticket.prNumber === null) {
    return { ok: false, error: 'This ticket has no pull request yet' };
  }
  const values = templateValues(project, ticket, null);
  const changes = action.changes.map((change) =>
    describeChange(
      change,
      change.kind === 'title' || change.kind === 'description'
        ? renderTemplate(change.value, values)
        : '',
    ),
  );
  return { ok: true, kind: 'github_pull_request', number: ticket.prNumber, changes };
}

/** The fields with their templates filled in; the options are checked when the rule runs. */
function gitHubProjectFieldsPreview(
  _db: Db,
  project: Project,
  ticket: Ticket,
  action: GitHubProjectFieldsAction,
): RulePreview {
  const number = action.item === 'issue' ? ticket.issueNumber : ticket.prNumber;
  if (number === null || (action.item === 'issue' && ticket.projectItemId === null)) {
    return {
      ok: false,
      error:
        action.item === 'issue'
          ? "This ticket's issue is not on the GitHub Project"
          : 'This ticket has no pull request yet',
    };
  }
  const values = templateValues(project, ticket, null);
  const fields = action.values.map((entry) => ({
    name: entry.fieldName,
    text: renderTemplate(entry.value, values),
  }));
  return { ok: true, kind: 'github_project_fields', item: action.item, number, fields };
}

const PREVIEWS: Previews = {
  notion_property: notionPreview,
  github_comment: gitHubCommentPreview,
  github_pull_request: gitHubPullRequestPreview,
  github_project_fields: gitHubProjectFieldsPreview,
  union_notification: unionNotificationPreview,
};

/** What the rule's action would do for the ticket; nothing is sent. */
export function previewOf<K extends ActionKind>(
  db: Db,
  project: Project,
  ticket: Ticket,
  action: ActionOf<K>,
): RulePreview {
  return PREVIEWS[action.kind](db, project, ticket, action);
}
