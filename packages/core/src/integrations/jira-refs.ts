// Jira's `refs` capability: issues named by key or by a link of the site, in a text, read to link them.

import type { JiraApi } from './jira-api';
import { jiraConfigOf } from './jira-config';
import { checkJiraItem } from './jira-item-text';
import { jiraKeysIn } from './jira-keys';
import { integrationKind } from './kinds';
import type { TrackerAdapter } from './tracker-adapter';

export function jiraRefs(jira: JiraApi): NonNullable<TrackerAdapter['refs']> {
  const kind = integrationKind('jira');
  return {
    parse: (input) => kind.parseRef(input),
    error: (input, config) => kind.refError?.(input, config) ?? null,
    namedIn: (texts, config) => {
      const { projectKey, site } = jiraConfigOf(config);
      return jiraKeysIn(texts, projectKey, site);
    },
    check: (secret, config, key, anywhere) =>
      checkJiraItem(jira, { secret, config }, key, anywhere),
    url: (key, config) => `${jiraConfigOf(config).site}/browse/${key}`,
  };
}
