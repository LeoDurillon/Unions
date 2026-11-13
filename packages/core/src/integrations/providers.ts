// The adapter of each kind of tracker, built over the API clients the process has; its provider is the adapter.

import { jiraAdapter } from './jira-adapter';
import type { JiraApi } from './jira-api';
import type { IntegrationKindName } from './kinds';
import { notionAdapter } from './notion-adapter';
import type { NotionApi } from './notion-api';
import type { IntegrationProvider } from './provider';
import type { TrackerAdapter } from './tracker-adapter';

/** The clients adapters call; tests substitute fakes. */
export type IntegrationApis = { notion: NotionApi; jira: JiraApi };

const ADAPTERS: Record<IntegrationKindName, (apis: IntegrationApis) => TrackerAdapter> = {
  notion: (apis) => notionAdapter(apis.notion),
  jira: (apis) => jiraAdapter(apis.jira),
};

export function trackerAdapter(kind: IntegrationKindName, apis: IntegrationApis): TrackerAdapter {
  return ADAPTERS[kind](apis);
}

export function integrationProvider(
  kind: IntegrationKindName,
  apis: IntegrationApis,
): IntegrationProvider {
  return trackerAdapter(kind, apis);
}
