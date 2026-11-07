// A project's Jira integration as rules read it: the Jira project's statuses and the site's settable fields, as stored.
import type { Db } from '../db';
import type { JiraAuth } from './jira-api';
import { readJiraConfig } from './jira-config';
import { isJiraFieldType, isSettableFieldId, type JiraFieldInfo } from './jira-field-types';
import type { JiraProject, JiraStatus } from './jira-parse';
import { integrationOf } from './store';

/** What Union keeps of the Jira project (`integrations.fields`), read by Refresh. */
export type JiraFields = {
  projectName: string;
  issueTypes: JiraProject['issueTypes'];
  statuses: JiraStatus[];
  /** Empty for a project whose fields were read before rules could set them: Refresh reads them. */
  fields: JiraFieldInfo[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStatus(value: unknown): value is JiraStatus {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.category === 'string'
  );
}

/** A stored field a rule can still set: fields read before the settable list was narrowed are dropped here. */
function isFieldInfo(value: unknown): value is JiraFieldInfo {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isSettableFieldId(value.id) &&
    typeof value.name === 'string' &&
    isJiraFieldType(value.type)
  );
}

/** The stored fields of a Jira integration; null when they are not Jira's or not read yet. */
function jiraFieldsOf(fields: unknown): JiraFields | null {
  if (!isRecord(fields) || typeof fields.projectName !== 'string') {
    return null;
  }
  const statuses = Array.isArray(fields.statuses) ? fields.statuses.filter(isStatus) : [];
  const settable = Array.isArray(fields.fields) ? fields.fields.filter(isFieldInfo) : [];
  const issueTypes = Array.isArray(fields.issueTypes) ? fields.issueTypes : [];
  return {
    projectName: fields.projectName,
    // Types read before the sub-task flag was kept count as plain types.
    issueTypes: issueTypes.flatMap((type: unknown) =>
      isRecord(type) && typeof type.id === 'string' && typeof type.name === 'string'
        ? [{ id: type.id, name: type.name, subtask: type.subtask === true }]
        : [],
    ),
    statuses,
    fields: settable,
  };
}

/** Who calls Jira for the project: its site, account email and token; null when it is not connected. */
export function jiraAuthOf(db: Db, projectId: number): JiraAuth | null {
  const integration = integrationOf(db, projectId, 'jira');
  const read = integration ? readJiraConfig(integration.config) : null;
  if (!integration || !read || 'error' in read) {
    return null;
  }
  return { site: read.config.site, email: read.config.email, token: integration.secret };
}

/** The project's Jira fields as last read; null when it is not connected to Jira or nothing was read. */
export function jiraFieldsFor(db: Db, projectId: number): JiraFields | null {
  const integration = integrationOf(db, projectId, 'jira');
  return integration ? jiraFieldsOf(integration.fields) : null;
}

/**
 * What the rule editor knows of the Jira project: its name, when it was read (null: not yet, as for a
 * project connected in the setup wizard, which saves the connection without reading it), its statuses
 * and settable fields.
 */
export type JiraRuleSource = {
  title: string;
  readAt: number | null;
  statuses: JiraStatus[];
  fields: JiraFieldInfo[];
};

export function jiraRuleSourceOf(db: Db, projectId: number): JiraRuleSource | null {
  const integration = integrationOf(db, projectId, 'jira');
  if (!integration) {
    return null;
  }
  const fields = jiraFieldsOf(integration.fields);
  return {
    title: integration.title || (fields?.projectName ?? ''),
    readAt: fields ? integration.fieldsReadAt : null,
    statuses: fields?.statuses ?? [],
    fields: fields?.fields ?? [],
  };
}
