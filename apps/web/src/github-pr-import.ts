// Reads a pull request to import as a ticket, in one GraphQL query: its branches and head, and the issues it closes with their comments.
import type { Octokit } from 'octokit';

import type { PullRequestSource } from './api-pr-import-types';

export type { PullRequestSource } from './api-pr-import-types';

const LINKED_ISSUES = 5;
const COMMENTS = 100;

const QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title body url state isDraft headRefName baseRefName headRefOid isCrossRepository
      closingIssuesReferences(first: ${LINKED_ISSUES}) {
        nodes {
          number id title body url
          comments(last: ${COMMENTS}) { nodes { databaseId body } }
        }
      }
    }
  }
}`;

const STATES = { OPEN: 'open', CLOSED: 'closed', MERGED: 'merged' } as const;

type IssueNode = {
  number: number;
  id: string;
  title: string;
  body: string;
  url: string;
  comments: { nodes: ({ databaseId: number | null; body: string } | null)[] };
};

type Response = {
  repository: {
    pullRequest: {
      number: number;
      title: string;
      body: string;
      url: string;
      state: 'OPEN' | 'CLOSED' | 'MERGED';
      isDraft: boolean;
      headRefName: string;
      baseRefName: string;
      headRefOid: string;
      isCrossRepository: boolean;
      closingIssuesReferences: { nodes: (IssueNode | null)[] } | null;
    } | null;
  } | null;
};

function issueOf(node: IssueNode): PullRequestSource['issues'][number] {
  return {
    number: node.number,
    nodeId: node.id,
    title: node.title,
    body: node.body,
    url: node.url,
    comments: node.comments.nodes.flatMap((comment) =>
      comment?.databaseId ? [{ id: String(comment.databaseId), body: comment.body }] : [],
    ),
  };
}

/** The pull request and the issues it closes; null when the repository has no such pull request. */
export async function fetchPullRequestSource(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<PullRequestSource | null> {
  const data = await octokit.graphql<Response>(QUERY, { ...repo, number });
  const pull = data.repository?.pullRequest;
  if (!pull) {
    return null;
  }
  return {
    number: pull.number,
    title: pull.title,
    body: pull.body,
    url: pull.url,
    state: STATES[pull.state],
    draft: pull.isDraft,
    headBranch: pull.headRefName,
    baseBranch: pull.baseRefName,
    headSha: pull.headRefOid,
    fromFork: pull.isCrossRepository,
    issues: (pull.closingIssuesReferences?.nodes ?? []).flatMap((node) =>
      node ? [issueOf(node)] : [],
    ),
  };
}
