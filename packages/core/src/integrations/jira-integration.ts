// A project's Jira integration as rules read it: the Jira project's statuses and the site's settable fields, as stored.
import type { Db } from '../db';
import { isJiraFieldType, type JiraFieldInfo } from './jira-field-types';
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

function isFieldInfo(value: unknown): value is JiraFieldInfo {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
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
    issueTypes: issueTypes.filter(
      (type): type is { id: string; name: string } =>
        isRecord(type) && typeof type.id === 'string' && typeof type.name === 'string',
    ),
    statuses,
    fields: settable,
  };
}

/** The project's Jira fields as last read; null when it is not connected to Jira or nothing was read. */
export function jiraFieldsFor(db: Db, projectId: number): JiraFields | null {
  const integration = integrationOf(db, projectId, 'jira');
  return integration ? jiraFieldsOf(integration.fields) : null;
}
