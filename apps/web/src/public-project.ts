// A project and its integrations as the browser sees them: no secret, no token (server only).
import { integrationKind, schema, type Db, type Integration, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import type { PublicIntegration } from './api-integration-types';
import { toPublicProject, type PublicProject } from './api-types';

/** The secret is left out here and only here, as `toPublicProject` leaves out the GitHub token. */
export function toPublicIntegration(integration: Integration): PublicIntegration {
  return {
    kind: integration.kind,
    title: integration.title,
    ready: 'config' in integrationKind(integration.kind).readConfig(integration.config),
    config: integration.config,
    fieldsReadAt: integration.fieldsReadAt,
  };
}

function publicIntegrationsOf(db: Db, projectId: number): PublicIntegration[] {
  return db
    .select()
    .from(schema.integrations)
    .where(eq(schema.integrations.projectId, projectId))
    .all()
    .map((integration) => toPublicIntegration(integration));
}

/** The project as the browser sees it, with its integrations. */
export function publicProjectOf(db: Db, project: Project): PublicProject {
  return toPublicProject(project, publicIntegrationsOf(db, project.id));
}
