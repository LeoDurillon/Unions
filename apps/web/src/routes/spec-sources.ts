// A specification's text from where the user points: the PR, the ticket, a GitHub issue, a tracker's item.

import {
  integrationKind,
  integrationOf,
  projectGitHubAuth,
  trackerAdapter,
  withoutUnionLinks,
  type Db,
  type IntegrationKindName,
  type JiraApi,
  type NotionApi,
  type SpecSource,
} from '@union/core';

import type { OnboardingGitHub } from '../github-onboarding';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from '../http';
import { parseIssueRef } from '../pull-request-ref';
import { guarded } from './github-errors';
import type { GroupingTarget } from './review/review-groupings';
import { guarded as trackerGuarded } from './tracker-errors';

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

/**
 * Any item of the project's tracker the account can read: a Notion page shared with the integration, an
 * issue of the Jira site of any project (a review may implement another project's). Its text as the import
 * converts it, attachments listed but not read.
 */
async function trackerSpec(
  readers: SpecReaders,
  target: GroupingTarget,
  spec: { kind: IntegrationKindName; ref: string },
): Promise<SpecText> {
  const { label, itemLabel, namedByKey } = integrationKind(spec.kind);
  const integration = integrationOf(readers.db, target.project.id, spec.kind);
  const { refs, text } = trackerAdapter(spec.kind, readers);
  if (!integration || !refs || !text) {
    throw fail(
      CONFLICT,
      `Connect the project to ${label} first (Settings → Integrations → ${label})`,
    );
  }
  const itemId = refs.parse(spec.ref);
  if (!itemId) {
    throw fail(BAD_REQUEST, `Give a ${label} ${itemLabel} link or ID`);
  }
  const elsewhere = refs.error(spec.ref, integration.config);
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  const { secret, config } = integration;
  const read = await trackerGuarded(() => text.read(secret, config, itemId));
  // A tracker giving the title with the text (Jira) is read once; else the item is read for it.
  const found =
    read.title === undefined
      ? await trackerGuarded(() => refs.check(secret, config, itemId, true))
      : { itemId, title: read.title, url: refs.url(itemId, config) };
  const title = namedByKey
    ? `${found.itemId} ${found.title}`
    : found.title || `Untitled ${itemLabel}`;
  return {
    kind: spec.kind,
    label: `${label}: ${title}`.trim(),
    text: read.markdown.trim(),
    url: found.url,
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
  if (kind === 'issue') {
    return issueSpec(readers, target, ref);
  }
  return trackerSpec(readers, target, { kind, ref });
}
