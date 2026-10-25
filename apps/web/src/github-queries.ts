// The GraphQL queries the web server sends GitHub: Projects, a pull request's threads and notes,
// pull request lists.
export const OWNER_PROJECTS = /* GraphQL */ `
  query OwnerProjects($login: String!) {
    repositoryOwner(login: $login) {
      ... on ProjectV2Owner {
        projectsV2(first: 50) {
          nodes {
            id
            number
            title
            url
            closed
          }
        }
      }
    }
  }
`;

export const CREATE_PROJECT = /* GraphQL */ `
  mutation CreateProject($ownerId: ID!, $repositoryId: ID!, $title: String!) {
    createProjectV2(input: { ownerId: $ownerId, repositoryId: $repositoryId, title: $title }) {
      projectV2 {
        id
        number
        title
        url
      }
    }
  }
`;

/** A pull request's line-comment threads, with their replies, page by page. */
export const PULL_REQUEST_THREADS = /* GraphQL */ `
  query PullRequestThreads($owner: String!, $repo: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 50, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            path
            diffSide
            line
            startLine
            originalLine
            originalStartLine
            comments(first: 50) {
              nodes {
                author {
                  login
                }
                body
                url
                createdAt
                diffHunk
                originalCommit {
                  oid
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** A pull request's review summaries and conversation comments (the newest 100 of each). */
export const PULL_REQUEST_NOTES = /* GraphQL */ `
  query PullRequestNotes($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        body
        reviews(last: 100) {
          nodes {
            author {
              __typename
              login
            }
            body
            url
            state
            createdAt
          }
        }
        comments(last: 100) {
          nodes {
            author {
              __typename
              login
            }
            body
            url
            createdAt
          }
        }
      }
    }
  }
`;

/** The repository's pull requests in one state set, most recently updated first. */
export const REPOSITORY_PULL_REQUESTS = /* GraphQL */ `
  query RepositoryPullRequests($owner: String!, $repo: String!, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: $states, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          number
          title
          url
          state
          isDraft
          headRefName
          baseRefName
          isCrossRepository
          updatedAt
          reviewDecision
          additions
          deletions
          author {
            login
          }
        }
      }
    }
  }
`;
