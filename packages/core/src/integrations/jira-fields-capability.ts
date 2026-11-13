// Jira's `fields` capability: an issue read for its card, its moves, a field set by hand checked and sent.

import type { JiraApi } from './jira-api';
import { checkJiraField, jiraFieldFailure, setJiraField } from './jira-fields';
import { jiraMoves, readJiraItem } from './jira-item-read';
import { jiraAccess } from './jira-provider';
import type { TrackerAdapter } from './tracker-adapter';

export function jiraFieldsCapability(jira: JiraApi): NonNullable<TrackerAdapter['fields']> {
  return {
    read: (access, key) => readJiraItem(jira, access, key),
    moves: (access, key) => jiraMoves(jira, access, key),
    check: (access, key, input) =>
      checkJiraField(jira, jiraAccess(access.secret, access.config).auth, key, input),
    set: (access, change) =>
      setJiraField(jira, jiraAccess(access.secret, access.config).auth, change),
    setFailure: jiraFieldFailure,
  };
}
