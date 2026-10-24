// The browser's client for the integration endpoints, and a project's integration of a kind.
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { PublicIntegration, PublicProject, SourceImport } from '../../src/api-types';
import { request } from './api';

/** A tracker to connect a new project to, as the project creation takes it. */
export type NewIntegration = {
  kind: IntegrationKindName;
  secret: string;
  config: Record<string, unknown>;
};

const base = (projectId: number, kind: IntegrationKindName): string =>
  `/api/projects/${projectId}/integrations/${kind}`;

export const integrationsApi = {
  /** Checks a secret and config before saving them; the config comes back normalized. */
  verify: (
    kind: IntegrationKindName,
    secret: string,
    config: Record<string, unknown>,
  ): Promise<{ title: string; config: Record<string, unknown> }> =>
    request('POST', `/api/integrations/${kind}/verify`, { secret, config }),
  /** Reads the tracker with them, then saves; without a secret, the stored one is kept. */
  save: (
    projectId: number,
    kind: IntegrationKindName,
    change: { secret?: string; config: Record<string, unknown> },
  ): Promise<PublicIntegration> => request('PUT', base(projectId, kind), change),
  remove: (projectId: number, kind: IntegrationKindName): Promise<unknown> =>
    request('DELETE', base(projectId, kind)),
  /** Reads the tracker's columns again. */
  refreshFields: (projectId: number, kind: IntegrationKindName): Promise<PublicIntegration> =>
    request('POST', `${base(projectId, kind)}/fields`),
  importItem: (projectId: number, kind: IntegrationKindName, ref: string): Promise<SourceImport> =>
    request('POST', `${base(projectId, kind)}/import`, { ref }),
};

export function projectIntegration(
  project: PublicProject,
  kind: IntegrationKindName,
): PublicIntegration | null {
  const byKind = new Map(
    project.integrations.map((integration) => [integration.kind, integration]),
  );
  return byKind.get(kind) ?? null;
}

/** Tickets can be imported from it: connected, with a complete config. */
export function canImportFrom(project: PublicProject, kind: IntegrationKindName): boolean {
  return projectIntegration(project, kind)?.ready ?? false;
}
