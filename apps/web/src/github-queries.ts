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
