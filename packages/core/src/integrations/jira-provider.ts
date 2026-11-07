// Jira Cloud as an `IntegrationProvider`: verify, read the project's types and statuses, and import an issue of it.
import type { JiraApi, JiraAuth } from './jira-api';
import { issueMarkdown } from './jira-attachments';
import { jiraConfigOf } from './jira-config';
import type { JiraFields } from './jira-integration';
import { attachmentsByMediaId, hasUnnamedMedia } from './jira-media-ids';
import { ItemOutsideSourceError, type IntegrationProvider, type SourceItem } from './provider';

function authOf(token: string, config: unknown): { auth: JiraAuth; projectKey: string } {
  const { site, email, projectKey } = jiraConfigOf(config);
  return { auth: { site, email, token }, projectKey };
}

async function item(
  jira: JiraApi,
  token: string,
  config: unknown,
  key: string,
): Promise<SourceItem> {
  const { auth, projectKey } = authOf(token, config);
  const issue = await jira.issue(auth, key);
  if (issue.projectKey !== projectKey) {
    throw new ItemOutsideSourceError(
      `This issue is not in the project's Jira project (${projectKey})`,
    );
  }
  const byMediaId = hasUnnamedMedia(issue)
    ? await attachmentsByMediaId(jira, auth, issue)
    : new Map<string, string>();
  return {
    id: issue.key,
    title: issue.summary,
    url: `${auth.site}/browse/${issue.key}`,
    markdown: issueMarkdown(issue, auth.site, byMediaId),
    truncated: false,
  };
}

export function jiraProvider(jira: JiraApi): IntegrationProvider {
  return {
    verify: async (token, config) => {
      const { auth, projectKey } = authOf(token, config);
      // Checks the email and token first: a bad pair would otherwise read as a missing project.
      await jira.myself(auth);
      const project = await jira.project(auth, projectKey);
      return { title: project.name };
    },
    readFields: async (token, config): Promise<{ title: string; fields: JiraFields }> => {
      const { auth, projectKey } = authOf(token, config);
      const [project, statuses, fields] = await Promise.all([
        jira.project(auth, projectKey),
        jira.statuses(auth, projectKey),
        jira.fields(auth),
      ]);
      return {
        title: project.name,
        fields: { projectName: project.name, issueTypes: project.issueTypes, statuses, fields },
      };
    },
    item: (token, config, key) => item(jira, token, config, key),
  };
}
