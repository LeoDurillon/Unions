// An issue created in a Jira project from a ticket Union wrote (an investigation's): its type, summary, description.

import type { JiraApi } from './jira-api';
import { jiraConfigOf } from './jira-config';
import type { JiraProject } from './jira-parse';
import { markdownAdf } from './markdown-adf';
import type { SourceItem } from './provider';

/** Jira's limits: a summary's length, and a description's, kept clear of with room for the note. */
const MAX_SUMMARY = 255;
const MAX_DESCRIPTION = 30_000;
const CUT_NOTE = '(cut: the full description is in Union)';
const PARAGRAPH_BREAK = '\n\n';

/** The configured type when the project still has it, else Task, else its first type; never a sub-task. */
export function issueTypeFor(types: JiraProject['issueTypes'], configured?: string): string | null {
  const plain = types.filter((type) => !type.subtask);
  const chosen =
    plain.find((type) => type.id === configured) ??
    plain.find((type) => type.name.toLowerCase() === 'task') ??
    plain[0];
  return chosen?.id ?? null;
}

/** The description within Jira's limit: cut at the last paragraph before it, with a note saying so. */
export function cutDescription(markdown: string): { markdown: string; cut: boolean } {
  if (markdown.length <= MAX_DESCRIPTION) {
    return { markdown, cut: false };
  }
  const head = markdown.slice(0, MAX_DESCRIPTION);
  const end = head.lastIndexOf(PARAGRAPH_BREAK);
  const kept = end > 0 ? head.slice(0, end) : head;
  return { markdown: `${kept}${PARAGRAPH_BREAK}${CUT_NOTE}`, cut: true };
}

/** Creates the issue in the integration's project and says where it is; a config not Jira's rejects. */
export async function createJiraIssue(
  jira: JiraApi,
  token: string,
  stored: unknown,
  item: { title: string; markdown: string },
): Promise<SourceItem> {
  const config = jiraConfigOf(stored);
  const auth = { site: config.site, email: config.email, token };
  const project = await jira.project(auth, config.projectKey);
  const issueTypeId = issueTypeFor(project.issueTypes, config.issueTypeId);
  if (issueTypeId === null) {
    throw new Error(
      `The Jira project ${config.projectKey} has no issue type to create an issue with`,
    );
  }
  const summary = item.title.trim().slice(0, MAX_SUMMARY);
  const description = cutDescription(item.markdown);
  const { key } = await jira.createIssue(auth, {
    projectKey: config.projectKey,
    issueTypeId,
    summary,
    description: markdownAdf(description.markdown),
  });
  return {
    id: key,
    title: summary,
    url: `${auth.site}/browse/${key}`,
    markdown: description.markdown,
    truncated: description.cut,
  };
}
