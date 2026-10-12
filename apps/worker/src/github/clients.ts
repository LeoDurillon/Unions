import { projectGitHubAuth, type Db, type Project } from '@union/core';
import { githubClient } from '@union/core/github-client';
import type { Octokit } from 'octokit';

import type { GitHubApi } from './api';
import { OctokitGitHubApi } from './octokit-api';

/**
 * Each project's API: its GitHub App installation or its token, `GITHUB_TOKEN` for projects with
 * neither. Clients are shared per credential, so an installation token is minted once an hour.
 */
export function githubApis(db: Db): (project: Project) => GitHubApi | null {
  const apis = new WeakMap<Octokit, GitHubApi>();
  function apiFor(project: Project): GitHubApi | null {
    const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
    if (!auth) {
      return null;
    }
    const client = githubClient(auth);
    const known = apis.get(client) ?? new OctokitGitHubApi(client);
    apis.set(client, known);
    return known;
  }
  return apiFor;
}
