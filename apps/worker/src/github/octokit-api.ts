// The GitHub API implemented with Octokit: issues, pull requests and the project board.
import type { ProjectLocator, ReviewVerdict } from '@union/core';

import type {
  GitHubApi,
  IssueRef,
  ProjectInfo,
  PullRequestRef,
  PullRequestReview,
  PullRequestStatus,
  RemoteComment,
  RemoteItem,
  RepoRef,
} from './api';
import { OctokitProjectFields } from './octokit-project-fields';
import { isNotFound } from './octokit-pull-request-changes';
import {
  ADD_TO_PROJECT,
  LIST_ITEMS,
  MARK_READY,
  PROJECT_INFO,
  RESOLVE_ORG_PROJECT,
  RESOLVE_USER_PROJECT,
  SET_STATUS,
} from './queries';

const REVIEW_EVENTS: Record<ReviewVerdict, 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'> = {
  comment: 'COMMENT',
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
};

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

function timeOf(date: string | null): number | null {
  return date === null ? null : Date.parse(date);
}

export class OctokitGitHubApi extends OctokitProjectFields implements GitHubApi {
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

  async pullRequestBody(repo: RepoRef, number: number): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({ ...repo, pull_number: number });
    return data.body ?? '';
  }

  async updatePullRequestBody(repo: RepoRef, number: number, body: string): Promise<void> {
    await this.octokit.rest.pulls.update({ ...repo, pull_number: number, body });
  }

  async markPullRequestReady(repo: RepoRef, number: number): Promise<void> {
    const { data } = await this.octokit.rest.pulls.get({ ...repo, pull_number: number });
    if (data.draft) {
      await this.octokit.graphql(MARK_READY, { id: data.node_id });
    }
  }

  async pullRequestStatus(
    repo: RepoRef,
    number: number,
    behind: boolean,
  ): Promise<PullRequestStatus | null> {
    const pull = await this.octokit.rest.pulls
      .get({ ...repo, pull_number: number })
      .catch((error: unknown) => {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      });
    if (!pull) {
      return null;
    }
    if (pull.data.state !== 'open') {
      return pull.data.merged
        ? { state: 'merged', behindBy: null, mergedAt: timeOf(pull.data.merged_at), closedAt: null }
        : {
            state: 'closed',
            behindBy: null,
            mergedAt: null,
            closedAt: timeOf(pull.data.closed_at),
          };
    }
    if (!behind) {
      return { state: 'open', behindBy: null, mergedAt: null, closedAt: null };
    }
    const { base, head } = pull.data;
    const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
      ...repo,
      basehead: `${base.ref}...${head.sha}`,
      per_page: 1,
    });
    return { state: 'open', behindBy: data.behind_by, mergedAt: null, closedAt: null };
  }

  async createPullRequestReview(
    repo: RepoRef,
    number: number,
    review: PullRequestReview,
  ): Promise<string> {
    const { data } = await this.octokit.rest.pulls.createReview({
      ...repo,
      pull_number: number,
      ...(review.commitId ? { commit_id: review.commitId } : {}),
      body: review.body,
      event: REVIEW_EVENTS[review.verdict],
      comments: review.comments.map((comment) => ({
        path: comment.path,
        body: comment.body,
        side: comment.side,
        line: comment.line,
        ...(comment.startLine === undefined
          ? {}
          : { start_line: comment.startLine, start_side: comment.side }),
      })),
    });
    return data.html_url;
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
