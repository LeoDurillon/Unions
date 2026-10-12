import type { ProjectLocator } from '@union/core';
import { RequestError, type Octokit } from 'octokit';

import type {
  GitHubApi,
  IssueRef,
  ProjectInfo,
  PullRequestRef,
  RemoteComment,
  RemoteItem,
  RepoRef,
} from './api';
import {
  ADD_TO_PROJECT,
  LIST_ITEMS,
  MARK_READY,
  PROJECT_INFO,
  RESOLVE_ORG_PROJECT,
  RESOLVE_USER_PROJECT,
  SET_STATUS,
} from './queries';

const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  return error instanceof RequestError && error.status === NOT_FOUND;
}

type ProjectInfoResponse = {
  node: { field: { id: string; options: { id: string; name: string }[] } | null } | null;
};

type ItemNode = {
  id: string;
  fieldValueByName: { name: string } | null;
  content: {
    id: string;
    number: number;
    title: string;
    body: string;
    updatedAt: string;
    repository: { nameWithOwner: string };
  } | null;
};

type ListItemsResponse = {
  node: {
    items: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: (ItemNode | null)[];
    };
  } | null;
};

function toRemoteItem(node: ItemNode): RemoteItem | null {
  const { content } = node;
  if (!content?.id) {
    return null; // draft issue, pull request, or redacted item
  }
  return {
    itemId: node.id,
    issueNumber: content.number,
    issueNodeId: content.id,
    repository: content.repository.nameWithOwner,
    title: content.title,
    body: content.body,
    status: node.fieldValueByName?.name ?? null,
    updatedAt: content.updatedAt,
  };
}

export class OctokitGitHubApi implements GitHubApi {
  /** A token client or an installation client (`githubClient` in `@union/core/github-client`). */
  constructor(private readonly octokit: Octokit) {}

  async resolveProject(locator: ProjectLocator): Promise<string> {
    const variables = { login: locator.login, number: locator.number };
    const data =
      locator.kind === 'orgs'
        ? await this.octokit.graphql<{ organization: { projectV2: { id: string } | null } | null }>(
            RESOLVE_ORG_PROJECT,
            variables,
          )
        : await this.octokit.graphql<{ user: { projectV2: { id: string } | null } | null }>(
            RESOLVE_USER_PROJECT,
            variables,
          );
    const owner = 'organization' in data ? data.organization : data.user;
    if (!owner?.projectV2) {
      throw new Error(`Project ${locator.kind}/${locator.login}/${locator.number} not found`);
    }
    return owner.projectV2.id;
  }

  async getProjectInfo(projectNodeId: string): Promise<ProjectInfo> {
    const data = await this.octokit.graphql<ProjectInfoResponse>(PROJECT_INFO, {
      id: projectNodeId,
    });
    const field = data.node?.field;
    if (!field) {
      throw new Error(`Project ${projectNodeId} has no single-select "Status" field`);
    }
    return {
      statusFieldId: field.id,
      options: Object.fromEntries(field.options.map((option) => [option.name, option.id])),
    };
  }

  async createIssue(repo: RepoRef, input: { title: string; body: string }): Promise<IssueRef> {
    const { data } = await this.octokit.rest.issues.create({ ...repo, ...input });
    return { number: data.number, nodeId: data.node_id };
  }

  async addToProject(projectNodeId: string, issueNodeId: string): Promise<string> {
    const data = await this.octokit.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
      ADD_TO_PROJECT,
      { projectId: projectNodeId, contentId: issueNodeId },
    );
    return data.addProjectV2ItemById.item.id;
  }

  async setStatus(input: {
    projectNodeId: string;
    itemId: string;
    fieldId: string;
    optionId: string;
  }): Promise<void> {
    await this.octokit.graphql(SET_STATUS, {
      projectId: input.projectNodeId,
      itemId: input.itemId,
      fieldId: input.fieldId,
      optionId: input.optionId,
    });
  }

  async listComments(repo: RepoRef, issueNumber: number): Promise<RemoteComment[]> {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      ...repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    return comments.map((comment) => ({ id: String(comment.id), body: comment.body ?? '' }));
  }

  async createComment(repo: RepoRef, issueNumber: number, body: string): Promise<string> {
    const { data } = await this.octokit.rest.issues.createComment({
      ...repo,
      issue_number: issueNumber,
      body,
    });
    return String(data.id);
  }

  async updateComment(repo: RepoRef, commentId: string, body: string): Promise<void> {
    await this.octokit.rest.issues.updateComment({
      ...repo,
      comment_id: Number(commentId),
      body,
    });
  }

  async listProjectItems(projectNodeId: string): Promise<RemoteItem[]> {
    const items: RemoteItem[] = [];
    let cursor: string | null = null;
    let hasNext = true;
    while (hasNext) {
      const data: ListItemsResponse = await this.octokit.graphql<ListItemsResponse>(LIST_ITEMS, {
        id: projectNodeId,
        cursor,
      });
      const page = data.node?.items;
      if (!page) {
        throw new Error(`Project ${projectNodeId} not found`);
      }
      for (const node of page.nodes) {
        const item = node ? toRemoteItem(node) : null;
        if (item) {
          items.push(item);
        }
      }
      ({ hasNextPage: hasNext, endCursor: cursor } = page.pageInfo);
    }
    return items;
  }

  async findPullRequest(repo: RepoRef, branch: string): Promise<PullRequestRef | null> {
    const { data } = await this.octokit.rest.pulls.list({
      ...repo,
      head: `${repo.owner}:${branch}`,
      state: 'open',
      per_page: 1,
    });
    const [first] = data;
    return first ? { number: first.number, url: first.html_url } : null;
  }

  /** Opened as a draft: the user marks it ready at the final review. */
  async createPullRequest(
    repo: RepoRef,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullRequestRef> {
    const { data } = await this.octokit.rest.pulls.create({ ...repo, ...input, draft: true });
    return { number: data.number, url: data.html_url };
  }

  async markPullRequestReady(repo: RepoRef, number: number): Promise<void> {
    const { data } = await this.octokit.rest.pulls.get({ ...repo, pull_number: number });
    if (data.draft) {
      await this.octokit.graphql(MARK_READY, { id: data.node_id });
    }
  }

  /** The dependency endpoints take the blocking issue's database id, not its number. */
  private async issueId(repo: RepoRef, number: number): Promise<number> {
    const { data } = await this.octokit.rest.issues.get({ ...repo, issue_number: number });
    return data.id;
  }

  async listBlockedBy(repo: RepoRef, issueNumber: number): Promise<number[]> {
    const issues = await this.octokit.paginate(this.octokit.rest.issues.listDependenciesBlockedBy, {
      ...repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    const own = `/repos/${repo.owner}/${repo.repo}`.toLowerCase();
    return issues
      .filter((issue) => issue.repository_url.toLowerCase().endsWith(own))
      .map((issue) => issue.number);
  }

  async addBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void> {
    await this.octokit.rest.issues.addBlockedByDependency({
      ...repo,
      issue_number: issueNumber,
      issue_id: await this.issueId(repo, blockingNumber),
    });
  }

  async removeBlockedBy(repo: RepoRef, issueNumber: number, blockingNumber: number): Promise<void> {
    try {
      await this.octokit.rest.issues.removeDependencyBlockedBy({
        ...repo,
        issue_number: issueNumber,
        issue_id: await this.issueId(repo, blockingNumber),
      });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }
}
