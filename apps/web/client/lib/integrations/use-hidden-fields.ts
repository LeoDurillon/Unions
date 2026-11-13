// The properties a project hides in its tracker tabs, read with the projects and saved for the project at once.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { ListedProject } from '../../../src/api-types';
import { api } from '../app/api';
import { integrationsApi } from './integrations-api';

const PROJECTS = ['projects'];

export type HiddenFields = {
  hidden: ReadonlySet<string>;
  /** Hides the property, or shows it again; saved for the project, every ticket's tab follows. */
  setHidden: (fieldId: string, hide: boolean) => void;
};

function hiddenOf(
  projects: ListedProject[] | undefined,
  projectId: number,
  kind: IntegrationKindName,
): string[] {
  const project = projects?.find((one) => one.id === projectId);
  return project?.integrations.find((one) => one.kind === kind)?.hiddenFields ?? [];
}

/** The list with the project's integration of `kind` hiding `fieldIds`. */
function withHidden(
  projects: ListedProject[] | undefined,
  change: { projectId: number; kind: IntegrationKindName; fieldIds: string[] },
): ListedProject[] | undefined {
  return projects?.map((project) =>
    project.id === change.projectId
      ? {
          ...project,
          integrations: project.integrations.map((integration) =>
            integration.kind === change.kind
              ? { ...integration, hiddenFields: change.fieldIds }
              : integration,
          ),
        }
      : project,
  );
}

export function useHiddenFields(projectId: number, kind: IntegrationKindName): HiddenFields {
  const client = useQueryClient();
  const projects = useQuery({ queryKey: PROJECTS, queryFn: api.projects });
  const current = hiddenOf(projects.data, projectId, kind);
  return {
    hidden: new Set(current),
    setHidden: (fieldId, hide) => {
      const others = current.filter((id) => id !== fieldId);
      const fieldIds = hide ? [...others, fieldId] : others;
      // Shown at once; the list is read again if saving fails.
      client.setQueryData<ListedProject[]>(PROJECTS, (old) =>
        withHidden(old, { projectId, kind, fieldIds }),
      );
      const save = async (): Promise<void> => {
        try {
          await integrationsApi.hideFields(projectId, kind, fieldIds);
        } catch {
          await client.invalidateQueries({ queryKey: PROJECTS });
        }
      };
      void save();
    },
  };
}
