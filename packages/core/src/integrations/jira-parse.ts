// Jira Cloud's REST v3 responses (project, statuses, fields, issue) read into Union's shapes.
// Anything unexpected reads as empty.
import { fieldTypeOf, type JiraFieldInfo } from './jira-field-types';

/** A Jira project: its key, name and issue types (`subtask`: a sub-task type, which needs a parent issue). */
export type JiraProject = {
  key: string;
  name: string;
  issueTypes: { id: string; name: string; subtask: boolean }[];
};

/** A status of the project's workflows, and its category (`new`, `indeterminate`, `done`). */
export type JiraStatus = { id: string; name: string; category: string };

/** A file attached to an issue; `content` is the URL that downloads it, with the token. */
type JiraAttachment = { id: string; filename: string; mimeType: string; content: string };

/** An issue as Union reads it: `description` is ADF (or null), converted by the provider. */
export type JiraIssue = {
  key: string;
  summary: string;
  projectKey: string;
  description: unknown;
  attachments: JiraAttachment[];
};

/** The account an email and token belong to. */
export type JiraAccount = { accountId: string; displayName: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string or number property as text; '' when it is neither. */
export function text(record: Record<string, unknown>, name: string): string {
  const value = record[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => isRecord(item)) : [];
}

export function accountOf(body: unknown): JiraAccount {
  const record = isRecord(body) ? body : {};
  const accountId = text(record, 'accountId');
  return { accountId, displayName: text(record, 'displayName') || accountId };
}

export function projectOf(body: unknown): JiraProject {
  const record = isRecord(body) ? body : {};
  return {
    key: text(record, 'key'),
    name: text(record, 'name'),
    issueTypes: records(record.issueTypes).map((type) => ({
      id: text(type, 'id'),
      name: text(type, 'name'),
      subtask: type.subtask === true,
    })),
  };
}

/** `GET /project/{key}/statuses` lists statuses per issue type; each status once. */
export function statusesOf(body: unknown): JiraStatus[] {
  const byId = new Map<string, JiraStatus>();
  for (const type of records(body)) {
    for (const status of records(type.statuses)) {
      const category = isRecord(status.statusCategory) ? text(status.statusCategory, 'key') : '';
      const id = text(status, 'id');
      if (id !== '' && !byId.has(id)) {
        byId.set(id, { id, name: text(status, 'name'), category });
      }
    }
  }
  return [...byId.values()];
}

/** A transition the issue's workflow offers from its current status, and the status it leads to. */
export type JiraTransition = { id: string; name: string; toId: string; toName: string };

/** A field of the issue's edit screen: a select's option names, null for a field without a list. */
export type JiraEditField = { allowedValues: string[] | null };

export function transitionsOf(body: unknown): JiraTransition[] {
  const list = isRecord(body) ? records(body.transitions) : [];
  return list.map((transition) => {
    const to = isRecord(transition.to) ? transition.to : {};
    return {
      id: text(transition, 'id'),
      name: text(transition, 'name'),
      toId: text(to, 'id'),
      toName: text(to, 'name'),
    };
  });
}

/** `GET /issue/{key}?fields=status`: the issue's current status. */
export function statusOf(body: unknown): { id: string; name: string } {
  const fields = isRecord(body) && isRecord(body.fields) ? body.fields : {};
  const status = isRecord(fields.status) ? fields.status : {};
  return { id: text(status, 'id'), name: text(status, 'name') };
}

/** `GET /issue/{key}/editmeta`: the fields the issue can be edited in, by id. */
export function editMetaOf(body: unknown): Record<string, JiraEditField> {
  const fields = isRecord(body) && isRecord(body.fields) ? body.fields : {};
  return Object.fromEntries(
    Object.entries(fields).map(([id, field]) => {
      const allowed =
        isRecord(field) && Array.isArray(field.allowedValues) ? field.allowedValues : null;
      const names = allowed?.flatMap((value: unknown) =>
        isRecord(value) && typeof value.value === 'string' ? [value.value] : [],
      );
      return [id, { allowedValues: names ?? null }];
    }),
  );
}

/** `GET /field`: the fields a rule can set, by name; the others (users, versions…) are left out. */
export function fieldsOf(body: unknown): JiraFieldInfo[] {
  return records(body)
    .flatMap((field) => {
      const schema = isRecord(field.schema) ? field.schema : {};
      const id = text(field, 'id');
      const type = fieldTypeOf(id, {
        type: text(schema, 'type'),
        items: text(schema, 'items'),
        custom: text(schema, 'custom'),
      });
      return id === '' || type === null ? [] : [{ id, name: text(field, 'name') || id, type }];
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

function attachmentOf(record: Record<string, unknown>): JiraAttachment {
  return {
    id: text(record, 'id'),
    filename: text(record, 'filename'),
    mimeType: text(record, 'mimeType'),
    content: text(record, 'content'),
  };
}

export function issueOf(body: unknown): JiraIssue {
  const record = isRecord(body) ? body : {};
  const fields = isRecord(record.fields) ? record.fields : {};
  const project = isRecord(fields.project) ? fields.project : {};
  return {
    key: text(record, 'key'),
    summary: text(fields, 'summary'),
    projectKey: text(project, 'key'),
    description: fields.description ?? null,
    attachments: records(fields.attachment)
      .map((attachment) => attachmentOf(attachment))
      .filter((attachment) => attachment.id !== ''),
  };
}

/** A Media Services file id: what Jira's media host and a description's media nodes name a file by. */
const MEDIA_FILE =
  /^\/file\/(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//iu;

/**
 * The file id in the address Jira redirects an attachment's download to
 * (`https://api.media.atlassian.com/file/<id>/binary?…`); null for any other answer.
 */
export function mediaIdOf(location: string | null): string | null {
  if (location === null || !URL.canParse(location)) {
    return null;
  }
  const url = new URL(location);
  const id = url.protocol === 'https:' ? MEDIA_FILE.exec(url.pathname)?.groups?.id : undefined;
  return id?.toLowerCase() ?? null;
}

/** Jira's error body (`errorMessages`, `errors`) as one sentence; null when it has none. */
export function errorMessageOf(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const messages = Array.isArray(body.errorMessages)
    ? body.errorMessages.filter((message) => typeof message === 'string')
    : [];
  const fieldErrors = isRecord(body.errors)
    ? Object.values(body.errors).filter((message) => typeof message === 'string')
    : [];
  const all = [...messages, ...fieldErrors];
  return all.length > 0 ? all.join(' ') : null;
}
