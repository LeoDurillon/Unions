export const PROJECT_INFO = /* GraphQL */ `
  query ProjectInfo($id: ID!) {
    node(id: $id) {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export const ADD_TO_PROJECT = /* GraphQL */ `
  mutation AddToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }
`;

export const SET_STATUS = /* GraphQL */ `
  mutation SetStatus($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }
`;

export const LIST_ITEMS = /* GraphQL */ `
  query ListItems($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
            content {
              ... on Issue {
                id
                number
                title
                body
                updatedAt
                repository {
                  nameWithOwner
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const RESOLVE_ORG_PROJECT = /* GraphQL */ `
  query ResolveOrgProject($login: String!, $number: Int!) {
    organization(login: $login) {
      projectV2(number: $number) {
        id
      }
    }
  }
`;

export const RESOLVE_USER_PROJECT = /* GraphQL */ `
  query ResolveUserProject($login: String!, $number: Int!) {
    user(login: $login) {
      projectV2(number: $number) {
        id
      }
    }
  }
`;

export const MARK_READY = /* GraphQL */ `
  mutation MarkReady($id: ID!) {
    markPullRequestReadyForReview(input: { pullRequestId: $id }) {
      pullRequest {
        isDraft
      }
    }
  }
`;
