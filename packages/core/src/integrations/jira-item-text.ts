// A Jira issue's text as markdown (its description, attachments named), and an issue read to link it.

import type { JiraApi, JiraAuth } from './jira-api';
import { issueMarkdown } from './jira-attachments';
import { jiraAccess, jiraProvider } from './jira-provider';
import type { LinkedItem, TrackerItemText } from './tracker-item';

export async function readJiraText(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
): Promise<TrackerItemText> {
  const issue = await jira.issue(auth, key);
  return {
    markdown: issueMarkdown(issue, auth.site).trim(),
    truncated: false,
    title: issue.summary,
  };
}

/**
 * An issue of the project's Jira project (a ticket's link); `anywhere`, any issue of the site the
 * account sees (a review's: a pull request may implement another project's).
 */
export async function checkJiraItem(
  jira: JiraApi,
  { secret, config }: { secret: string; config: unknown },
  key: string,
  anywhere = false,
): Promise<LinkedItem> {
  if (!anywhere) {
    const item = await jiraProvider(jira).item(secret, config, key);
    return { itemId: item.id, title: item.title || item.id, url: item.url };
  }
  const { auth } = jiraAccess(secret, config);
  const issue = await jira.issue(auth, key);
  return { itemId: issue.key, title: issue.summary, url: `${auth.site}/browse/${issue.key}` };
}
