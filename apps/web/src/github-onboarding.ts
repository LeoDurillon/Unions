import type { GitHubAppCredentials, GitHubAuth } from '@union/core';
import { githubAppClient, githubClient, type ClientOptions } from '@union/core/github-client';
import type { Octokit } from 'octokit';

import type {
  AppInfo,
  InstallationOption,
  ProjectOption,
  PullRequestInfo,
  GitHubIssue,
  PullRequestDiscussion,
  PullRequestFilter,
  RepoOption,
  Viewer,
} from './api-types';
import { fetchDiscussion } from './github-discussion';
import { fetchPullRequestFiles, type PullRequestFiles } from './github-pull-request-files';
import { fetchPullRequests, type RemotePullRequest } from './github-pull-requests';
import { CREATE_PROJECT, OWNER_PROJECTS } from './github-queries';

/**
 * GitHub calls the web server makes itself, because the UI needs the answer right away: the setup
 * wizard's reads and Project creation, checking the GitHub App, looking up a pull request to link,
 * reading its discussion for the PR tab and the review import, and listing the repository's pull
 * requests for the Pull requests tab. Every call takes a token or an app installation. Tests use a fake.
 */
export type OnboardingGitHub = {
  verify(auth: GitHubAuth): Promise<Viewer>;
  listRepos(auth: GitHubAuth, page: number): Promise<{ repos: RepoOption[]; hasNext: boolean }>;
  listProjects(auth: GitHubAuth, owner: string): Promise<ProjectOption[]>;
  createProject(
    auth: GitHubAuth,
    input: { ownerId: string; repositoryId: string; title: string },
  ): Promise<ProjectOption>;
  /** Null when the repository has no pull request with that number. */
  getPullRequest(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestInfo | null>;
  /** Line threads, review summaries and conversation comments; null when there is no such pull request. */
  getDiscussion(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestDiscussion | null>;
  /** The newest 100 pull requests of the filter; null when the repository is not reachable. */
  listPullRequests(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    filter: PullRequestFilter,
  ): Promise<{ total: number; pullRequests: RemotePullRequest[] } | null>;
  /** A pull request's head commit and changed files, for a review; null when there is no such PR. */
  getPullRequestFiles(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestFiles | null>;
  /** One issue of the repository; null when there is none with that number. */
  getIssue(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<GitHubIssue | null>;
  /** The app the credentials belong to (`GET /app`); rejects a wrong App ID or key. */
  verifyApp(app: GitHubAppCredentials): Promise<AppInfo>;
  listInstallations(app: GitHubAppCredentials): Promise<InstallationOption[]>;
};

const REQUIRED_SCOPES = ['repo', 'project'];
const PAGE_SIZE = 30;
const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('status' in error && error.status === NOT_FOUND) {
    return true;
  }
  // GraphQL answers 200 with a NOT_FOUND error for a missing pull request.
  return (
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.some(
      (item: unknown) =>
        typeof item === 'object' && item !== null && 'type' in item && item.type === 'NOT_FOUND',
    )
  );
}

type ProjectNode = { id: string; number: number; title: string; url: string; closed: boolean };

/** Classic tokens report scopes in a header; fine-grained tokens do not, so nothing is flagged. */
function missingScopes(header: string | undefined): string[] {
  if (header === undefined) {
    return [];
  }
  const granted = new Set(header.split(',').map((scope) => scope.trim()));
  return REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
}

type RawRepo = {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: { login: string; node_id: string };
  default_branch?: string;
  private: boolean;
};

function toRepoOption(repo: RawRepo): RepoOption {
  return {
    id: repo.id,
    nodeId: repo.node_id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    ownerNodeId: repo.owner.node_id,
    defaultBranch: repo.default_branch ?? 'main',
    isPrivate: repo.private,
  };
}

/** Users and organizations have a login; enterprises only a slug. */
function accountLogin(account: unknown): string {
  if (typeof account !== 'object' || account === null) {
    return '';
  }
  if ('login' in account && typeof account.login === 'string') {
    return account.login;
  }
  return 'slug' in account && typeof account.slug === 'string' ? account.slug : '';
}

async function verifyInstallation(
  auth: Extract<GitHubAuth, { kind: 'app' }>,
  options: ClientOptions,
): Promise<Viewer> {
  const { data } = await githubAppClient(auth.app, options).rest.apps.getInstallation({
    installation_id: auth.installationId,
  });
  return { login: accountLogin(data.account), missingScopes: [] };
}

async function installationRepos(
  octokit: Octokit,
  page: number,
): Promise<{ repos: RepoOption[]; hasNext: boolean }> {
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: PAGE_SIZE,
    page,
  });
  return {
    repos: data.repositories.map((repo) => toRepoOption(repo)),
    hasNext: page * PAGE_SIZE < data.total_count,
  };
}

export class OctokitOnboarding implements OnboardingGitHub {
  constructor(private readonly options: ClientOptions = {}) {}

  private client(auth: GitHubAuth): Octokit {
    return githubClient(auth, this.options);
  }

  async verify(auth: GitHubAuth): Promise<Viewer> {
    if (auth.kind === 'app') {
      return verifyInstallation(auth, this.options);
    }
    const { data, headers } = await this.client(auth).rest.users.getAuthenticated();
    return { login: data.login, missingScopes: missingScopes(headers['x-oauth-scopes']) };
  }

  async listRepos(
    auth: GitHubAuth,
    page: number,
  ): Promise<{ repos: RepoOption[]; hasNext: boolean }> {
    if (auth.kind === 'app') {
      return installationRepos(this.client(auth), page);
    }
    const { data, headers } = await this.client(auth).rest.repos.listForAuthenticatedUser({
      affiliation: 'owner,collaborator,organization_member',
      sort: 'pushed',
      per_page: PAGE_SIZE,
      page,
    });
    return {
      repos: data.map((repo) => toRepoOption(repo)),
      hasNext: headers.link?.includes('rel="next"') ?? false,
    };
  }

  async verifyApp(app: GitHubAppCredentials): Promise<AppInfo> {
    const { data } = await githubAppClient(app, this.options).rest.apps.getAuthenticated();
    if (!data) {
      throw new Error('GitHub returned no app for these credentials');
    }
    return { slug: data.slug ?? '', name: data.name, url: data.html_url };
  }

  async listInstallations(app: GitHubAppCredentials): Promise<InstallationOption[]> {
    const octokit = githubAppClient(app, this.options);
    const installations = await octokit.paginate(octokit.rest.apps.listInstallations, {
      per_page: PAGE_SIZE,
    });
    return installations.map((installation) => ({
      id: installation.id,
      account: accountLogin(installation.account),
      allRepositories: installation.repository_selection === 'all',
    }));
  }

  async listProjects(auth: GitHubAuth, owner: string): Promise<ProjectOption[]> {
    const data = await this.client(auth).graphql<{
      repositoryOwner: { projectsV2?: { nodes: (ProjectNode | null)[] } } | null;
    }>(OWNER_PROJECTS, { login: owner });
    const nodes = data.repositoryOwner?.projectsV2?.nodes ?? [];
    return nodes.flatMap((node) =>
      node && !node.closed
        ? [{ id: node.id, number: node.number, title: node.title, url: node.url }]
        : [],
    );
  }

  async createProject(
    auth: GitHubAuth,
    input: { ownerId: string; repositoryId: string; title: string },
  ): Promise<ProjectOption> {
    const data = await this.client(auth).graphql<{
      createProjectV2: { projectV2: ProjectOption };
    }>(CREATE_PROJECT, input);
    return data.createProjectV2.projectV2;
  }

  async getPullRequest(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestInfo | null> {
    try {
      const { data } = await this.client(auth).rest.pulls.get({
        ...repo,
        pull_number: number,
      });
      return {
        number: data.number,
        url: data.html_url,
        headBranch: data.head.ref,
        draft: data.draft ?? false,
        state: data.state === 'closed' ? 'closed' : 'open',
        merged: data.merged,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getDiscussion(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestDiscussion | null> {
    try {
      return await fetchDiscussion(this.client(auth), repo, number);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async listPullRequests(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    filter: PullRequestFilter,
  ): Promise<{ total: number; pullRequests: RemotePullRequest[] } | null> {
    try {
      return await fetchPullRequests(this.client(auth), repo, filter);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getPullRequestFiles(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestFiles | null> {
    try {
      return await fetchPullRequestFiles(this.client(auth), repo, number);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getIssue(
    auth: GitHubAuth,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<GitHubIssue | null> {
    try {
      const { data } = await this.client(auth).rest.issues.get({ ...repo, issue_number: number });
      return {
        number: data.number,
        nodeId: data.node_id,
        title: data.title,
        body: data.body ?? '',
        url: data.html_url,
        state: data.state === 'closed' ? 'closed' : 'open',
        pullRequest: data.pull_request !== undefined,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}
