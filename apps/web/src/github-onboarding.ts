import { Octokit } from 'octokit';

import type { ProjectOption, PullRequestInfo, RepoOption, Viewer } from './api-types';
import { CREATE_PROJECT, OWNER_PROJECTS } from './github-queries';

/**
 * GitHub calls the web server makes itself, because the UI needs the answer right away: the setup
 * wizard's reads and Project creation, and looking up a pull request to link. Tests use a fake.
 */
export type OnboardingGitHub = {
  verify(token: string): Promise<Viewer>;
  listRepos(token: string, page: number): Promise<{ repos: RepoOption[]; hasNext: boolean }>;
  listProjects(token: string, owner: string): Promise<ProjectOption[]>;
  createProject(
    token: string,
    input: { ownerId: string; repositoryId: string; title: string },
  ): Promise<ProjectOption>;
  /** Null when the repository has no pull request with that number. */
  getPullRequest(
    token: string,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestInfo | null>;
};

const REQUIRED_SCOPES = ['repo', 'project'];
const PAGE_SIZE = 30;
const NOT_FOUND = 404;

type ProjectNode = { id: string; number: number; title: string; url: string; closed: boolean };

/** Classic tokens report scopes in a header; fine-grained tokens do not, so nothing is flagged. */
function missingScopes(header: string | undefined): string[] {
  if (header === undefined) {
    return [];
  }
  const granted = new Set(header.split(',').map((scope) => scope.trim()));
  return REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
}

export class OctokitOnboarding implements OnboardingGitHub {
  async verify(token: string): Promise<Viewer> {
    const { data, headers } = await new Octokit({ auth: token }).rest.users.getAuthenticated();
    return { login: data.login, missingScopes: missingScopes(headers['x-oauth-scopes']) };
  }

  async listRepos(token: string, page: number): Promise<{ repos: RepoOption[]; hasNext: boolean }> {
    const { data, headers } = await new Octokit({
      auth: token,
    }).rest.repos.listForAuthenticatedUser({
      affiliation: 'owner,collaborator,organization_member',
      sort: 'pushed',
      per_page: PAGE_SIZE,
      page,
    });
    return {
      repos: data.map((repo) => ({
        id: repo.id,
        nodeId: repo.node_id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        ownerNodeId: repo.owner.node_id,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
      })),
      hasNext: headers.link?.includes('rel="next"') ?? false,
    };
  }

  async listProjects(token: string, owner: string): Promise<ProjectOption[]> {
    const data = await new Octokit({ auth: token }).graphql<{
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
    token: string,
    input: { ownerId: string; repositoryId: string; title: string },
  ): Promise<ProjectOption> {
    const data = await new Octokit({ auth: token }).graphql<{
      createProjectV2: { projectV2: ProjectOption };
    }>(CREATE_PROJECT, input);
    return data.createProjectV2.projectV2;
  }

  async getPullRequest(
    token: string,
    repo: { owner: string; repo: string },
    number: number,
  ): Promise<PullRequestInfo | null> {
    try {
      const { data } = await new Octokit({ auth: token }).rest.pulls.get({
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
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === NOT_FOUND
      ) {
        return null;
      }
      throw error;
    }
  }
}
