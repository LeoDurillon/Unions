// The text of a specification, from where the user points.
import {
  mentionTitles,
  notionMarkdown,
  parseNotionId,
  projectGitHubAuth,
  withoutUnionLinks,
  type Db,
  type NotionApi,
  type SpecSource,
} from '@union/core';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from '../http';
import { parseIssueRef } from '../pull-request-ref';
import { guarded } from './github-errors';
import { guarded as notionGuarded, notionTokenOf } from './notion';
import type { GroupingTarget } from './review-groupings';

/** What the services the specification can come from are read with: all read only. */
export type SpecReaders = { db: Db; github: OnboardingGitHub; notion: NotionApi };

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
  return kind === 'issue' ? issueSpec(readers, target, ref) : notionSpec(readers, target, ref);
}
