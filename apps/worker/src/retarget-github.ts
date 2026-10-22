// A change of target on GitHub: the base the pull request has now, the branches that exist, and the pull request moved onto the new base.
import { BUILDS_ON_LINK, type Project } from '@union/core';

import type { GitHubApi, RepoRef } from './github/api';
import { hostGit, type CloneSource } from './provision';

function repoOf(project: Project): RepoRef {
  return { owner: project.owner, repo: project.repo };
}

/**
 * The base the open pull request targets on GitHub now (GitHub retargets it by itself when the
 * branch it targeted is deleted), or why it cannot be retargeted.
 */
export async function currentBase(
  api: GitHubApi,
  project: Project,
  number: number,
): Promise<{ base: string } | { error: string }> {
  const status = await api.pullRequestStatus(repoOf(project), number, false);
  if (status?.state !== 'open') {
    return {
      error: `Pull request #${number} is ${status?.state ?? 'gone'}: only an open pull request can change its target.`,
    };
  }
  if (status.base === undefined) {
    return { error: `GitHub did not say which branch #${number} targets.` };
  }
  return { base: status.base };
}

/** The names among `branches` that the repository does not have. */
export async function missingBranches(
  remote: CloneSource,
  branches: readonly string[],
): Promise<string[]> {
  const refs = branches.map((name) => `refs/heads/${name}`);
  const listed = await hostGit(['ls-remote', '--heads', remote.url, ...refs], remote.secret);
  const found = new Set(
    listed
      .split('\n')
      .map((line) => line.split('\t')[1]?.trim())
      .filter((ref) => ref !== undefined),
  );
  return branches.filter((name) => !found.has(`refs/heads/${name}`));
}

/**
 * Points the pull request at `to` once the branch was pushed onto it, and drops the "Builds on"
 * line Union wrote when it targeted its parent's branch. A failure there is only reported.
 */
export async function moveOnGitHub(
  api: GitHubApi,
  project: Project,
  input: { number: number; to: string },
): Promise<string> {
  const repo = repoOf(project);
  await api.updatePullRequestBase(repo, input.number, input.to);
  try {
    const body = await api.pullRequestBody(repo, input.number);
    const parts = body.replaceAll('\r\n', '\n').split(/\n{2,}/u);
    const kept = parts.filter((part) => !BUILDS_ON_LINK.test(part.trim()));
    if (kept.length < parts.length) {
      await api.updatePullRequestBody(repo, input.number, kept.join('\n\n').trim());
    }
    return '';
  } catch (error) {
    return `\n\n**Not done on GitHub:** removing the "Builds on" line from the description: ${String(error)}`;
  }
}
