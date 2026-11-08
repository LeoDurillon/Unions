// The text of a specification, from where the user points: the PR, the ticket, a GitHub issue, a Notion page, a Jira issue.

import {
  integrationKind,
  integrationOf,
  issueMarkdown,
  jiraAuthOf,
  mentionTitles,
  notionMarkdown,
  parseNotionId,
  projectGitHubAuth,
  withoutUnionLinks,
  type Db,
  type JiraApi,
  type NotionApi,
  type SpecSource,
} from '@union/core';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from '../http';
import { parseIssueRef } from '../pull-request-ref';
import { guarded } from './github-errors';
import { guarded as notionGuarded, notionTokenOf } from './notion';
import type { GroupingTarget } from './review/review-groupings';

/** What the services the specification can come from are read with: all read only. */
export type SpecReaders = { db: Db; github: OnboardingGitHub; notion: NotionApi; jira: JiraApi };

/** The clients routes are built with, the database apart. */
export type SpecClients = Omit<SpecReaders, 'db'>;

/** A specification as the user checks it before the agent reads it; `url` where it lives, when it has one. */
export type SpecText = { kind: SpecSource; label: string; text: string; url?: string };

function githubAuth(
  readers: SpecReaders,
  target: GroupingTarget,
): NonNullable<ReturnType<typeof projectGitHubAuth>> {
  const auth = projectGitHubAuth(readers.db, target.project, process.env.GITHUB_TOKEN);
  if (!auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  return auth;
}

function repoOf(target: GroupingTarget): { owner: string; repo: string } {
  return { owner: target.project.owner, repo: target.project.repo };
}

async function pullRequestSpec(readers: SpecReaders, target: GroupingTarget): Promise<SpecText> {
  if (target.prNumber === null) {
    throw fail(CONFLICT, 'This ticket has no pull request yet: use its description');
  }
  const { prNumber } = target;
  const discussion = await guarded(() =>
    readers.github.getDiscussion(githubAuth(readers, target), repoOf(target), prNumber),
  );
  if (!discussion) {
    throw fail(NOT_FOUND, `Pull request #${prNumber} was not found`);
  }
  return {
    kind: 'pr',
    label: `PR #${prNumber} description`,
    text: withoutUnionLinks(discussion.description).trim(),
  };
}

async function issueSpec(
  readers: SpecReaders,
  target: GroupingTarget,
  ref: string,
): Promise<SpecText> {
  const { owner, repo } = repoOf(target);
  const number = parseIssueRef(ref, owner, repo);
  if (number === null) {
    throw fail(BAD_REQUEST, `Give an issue number or a URL of ${owner}/${repo}`);
  }
  const issue = await guarded(() =>
    readers.github.getIssue(githubAuth(readers, target), repoOf(target), number),
  );
  if (!issue) {
    throw fail(NOT_FOUND, `${owner}/${repo} has no issue #${number}`);
  }
  return {
    kind: 'issue',
    label: `Issue #${number}: ${issue.title}`,
    text: issue.body.trim(),
    url: `https://github.com/${owner}/${repo}/issues/${number}`,
  };
}

/** Any page the project's integration can read (it only sees the pages shared with it). */
async function notionSpec(
  readers: SpecReaders,
  target: GroupingTarget,
  ref: string,
): Promise<SpecText> {
  const token = notionTokenOf(readers.db, target.project.id);
  const id = parseNotionId(ref);
  if (!id) {
    throw fail(BAD_REQUEST, 'Give a Notion page URL or ID');
  }
  const page = await notionGuarded(() => readers.notion.page(token, id));
  const { markdown } = await notionGuarded(() => readers.notion.pageMarkdown(token, id));
  const titles = await mentionTitles(readers.notion, token, markdown);
  return {
    kind: 'notion',
    label: `Notion: ${page.title || 'Untitled page'}`,
    text: notionMarkdown(markdown, titles).trim(),
    url: page.url,
  };
}

/**
 * Any issue of the project's Jira site the account can see, not only its project's (a review may implement
 * another project's issue); its description as the import converts it, attachments listed but not read.
 */
async function jiraSpec(
  readers: SpecReaders,
  target: GroupingTarget,
  ref: string,
): Promise<SpecText> {
  const kind = integrationKind('jira');
  const integration = integrationOf(readers.db, target.project.id, 'jira');
  const auth = jiraAuthOf(readers.db, target.project.id);
  if (!integration || !auth) {
    throw fail(CONFLICT, 'Connect the project to Jira first (Settings → Integrations → Jira)');
  }
  const key = kind.parseRef(ref);
  if (!key) {
    throw fail(BAD_REQUEST, 'Give a Jira issue key or link, e.g. ABC-12');
  }
  const elsewhere = kind.refError?.(ref, integration.config) ?? null;
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  const issue = await notionGuarded(() => readers.jira.issue(auth, key));
  return {
    kind: 'jira',
    label: `Jira: ${issue.key} ${issue.summary}`.trim(),
    text: issueMarkdown(issue, auth.site).trim(),
    url: `${auth.site}/browse/${issue.key}`,
  };
}

/** The text of a specification, from where the user points. */
export function readSpec(
  readers: SpecReaders,
  target: GroupingTarget,
  kind: SpecSource,
  ref: string,
): Promise<SpecText> {
  if (kind === 'ticket') {
    if (target.ticketText === null) {
      throw fail(BAD_REQUEST, 'A pull request under review has no ticket');
    }
    return Promise.resolve({ kind, label: 'Ticket description', text: target.ticketText.trim() });
  }
  if (kind === 'pr') {
    return pullRequestSpec(readers, target);
  }
  if (kind === 'jira') {
    return jiraSpec(readers, target, ref);
  }
  return kind === 'issue' ? issueSpec(readers, target, ref) : notionSpec(readers, target, ref);
}
