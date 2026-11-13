// A Jira issue as its card shows it (summary, key, type, status, assignee, last update, its fields), and its moves.

import type { JiraApi } from './jira-api';
import { readJiraIssueFacts } from './jira-issue-facts';
import { jiraAccess } from './jira-provider';
import type { TrackerAccess } from './tracker-fields';
import type { TrackerItemFacts, TrackerMove } from './tracker-item';

/** Null when Jira does not give the issue. */
export async function readJiraItem(
  jira: JiraApi,
  access: TrackerAccess,
  key: string,
): Promise<TrackerItemFacts | null> {
  const facts = await readJiraIssueFacts(jira, jiraAccess(access.secret, access.config).auth, key);
  if (!facts) {
    return null;
  }
  return {
    title: facts.summary,
    key,
    type: facts.type,
    status: facts.status
      ? { field: null, name: facts.status.name, stage: facts.status.category }
      : null,
    assignee: facts.assignee,
    changedAt: facts.updatedAt,
    properties: facts.properties,
  };
}

/** The transitions the issue's workflow offers from where it is. */
export async function jiraMoves(
  jira: JiraApi,
  access: TrackerAccess,
  key: string,
): Promise<TrackerMove[]> {
  const transitions = await jira.transitions(jiraAccess(access.secret, access.config).auth, key);
  return transitions.map(({ id, name, toName }) => ({ id, name, toName }));
}
