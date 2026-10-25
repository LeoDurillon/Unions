// Replies to a pull request's comments in the worker's GitHub client: a line thread found, replied to and resolved, a conversation comment posted.
import type { RepoRef, ThreadPullRequest } from './api';
import { OctokitProjectFields } from './octokit-project-fields';

const THREAD_PULL_REQUEST = /* GraphQL */ `
  query ThreadPullRequest($id: ID!) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        pullRequest {
          number
          repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

const THREAD_FIRST_COMMENTS = /* GraphQL */ `
  query ThreadFirstComments($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            comments(first: 1) {
              nodes {
                url
              }
            }
          }
        }
      }
    }
  }
`;

const REPLY_TO_THREAD = /* GraphQL */ `
  mutation ReplyToThread($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
      comment {
        url
      }
    }
  }
`;

const RESOLVE_THREAD = /* GraphQL */ `
  mutation ResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread {
        id
      }
    }
  }
`;

type ThreadNode = {
  node: { pullRequest?: { number: number; repository: { nameWithOwner: string } } } | null;
};

type FirstCommentsPage = {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ({ id: string; comments: { nodes: ({ url: string } | null)[] } } | null)[];
      };
    } | null;
  } | null;
};

/** Stops a runaway pull request: 20 pages of 100 threads. */
const MAX_PAGES = 20;

export class OctokitThreads extends OctokitProjectFields {
  async threadPullRequest(threadId: string): Promise<ThreadPullRequest | null> {
    const data = await this.octokit.graphql<ThreadNode>(THREAD_PULL_REQUEST, { id: threadId });
    const pull = data.node?.pullRequest;
    return pull ? { repository: pull.repository.nameWithOwner, number: pull.number } : null;
  }

  async threadOfComment(repo: RepoRef, number: number, url: string): Promise<string | null> {
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data: FirstCommentsPage = await this.octokit.graphql<FirstCommentsPage>(
        THREAD_FIRST_COMMENTS,
        { ...repo, number, after },
      );
      const threads = data.repository?.pullRequest?.reviewThreads;
      if (!threads) {
        return null;
      }
      const found = threads.nodes.find((thread) => thread?.comments.nodes[0]?.url === url);
      if (found) {
        return found.id;
      }
      if (!threads.pageInfo.hasNextPage) {
        return null;
      }
      after = threads.pageInfo.endCursor;
    }
    return null;
  }

  async replyToThread(threadId: string, body: string): Promise<string> {
    const data = await this.octokit.graphql<{
      addPullRequestReviewThreadReply: { comment: { url: string } | null };
    }>(REPLY_TO_THREAD, { threadId, body });
    return data.addPullRequestReviewThreadReply.comment?.url ?? '';
  }

  async resolveThread(threadId: string): Promise<void> {
    await this.octokit.graphql(RESOLVE_THREAD, { threadId });
  }

  async createPullRequestComment(repo: RepoRef, number: number, body: string): Promise<string> {
    const { data } = await this.octokit.rest.issues.createComment({
      ...repo,
      issue_number: number,
      body,
    });
    return data.html_url;
  }
}
