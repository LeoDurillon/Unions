// Reading a GitHub Project's fields (the ones a rule can set) and setting one on an item: queries and parsing, for the web and the worker.
import type { ProjectField, ProjectFieldType } from './event-project-fields-action';

/** A field as read from GitHub, with its single select options' ids by name. */
export type RemoteProjectField = ProjectField & { optionIds: Record<string, string> };

export const PROJECT_FIELDS = /* GraphQL */ `
  query ProjectFields($id: ID!) {
    node(id: $id) {
      ... on ProjectV2 {
        fields(first: 100) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

export const SET_PROJECT_FIELD = /* GraphQL */ `
  mutation SetProjectField(
    $projectId: ID!
    $itemId: ID!
    $fieldId: ID!
    $value: ProjectV2FieldValue!
  ) {
    updateProjectV2ItemFieldValue(
      input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
    ) {
      projectV2Item {
        id
      }
    }
  }
`;

export const CLEAR_PROJECT_FIELD = /* GraphQL */ `
  mutation ClearProjectField($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
    clearProjectV2ItemFieldValue(
      input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId }
    ) {
      projectV2Item {
        id
      }
    }
  }
`;

type FieldNode = {
  id?: string;
  name?: string;
  dataType?: string;
  options?: { id: string; name: string }[];
};

export type ProjectFieldsResponse = { node: { fields?: { nodes: FieldNode[] } } | null };

const TYPES: Record<string, ProjectFieldType> = {
  SINGLE_SELECT: 'single_select',
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
};

/** The fields a rule can set, by name; null when there is no such Project. */
export function parseProjectFields(data: ProjectFieldsResponse): RemoteProjectField[] | null {
  if (!data.node?.fields) {
    return null;
  }
  return data.node.fields.nodes
    .flatMap((node): RemoteProjectField[] => {
      const type = TYPES[node.dataType ?? ''];
      if (!type || !node.id || !node.name) {
        return [];
      }
      const options = node.options ?? [];
      return [
        {
          id: node.id,
          name: node.name,
          type,
          options: options.map((option) => option.name),
          optionIds: Object.fromEntries(options.map((option) => [option.name, option.id])),
        },
      ];
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
