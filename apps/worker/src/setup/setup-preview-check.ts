// Checks proposed preview settings on a fresh clone as Start would, without a ticket and without starting anything.
// The compose file is resolved with the settings' additions, then refused for what a preview may not do, for a served
// service it does not declare, and for shared services that cannot be shared.

import { exposedServices, previewSecretValues, type Db, type PreviewConfig } from '@union/core';

import { readCatalog } from '../preview/catalog';
import { buildFile } from '../preview/compose-file';
import { PreviewError, type ComposeTarget, type PreviewDeps } from '../preview/target';

/** Where the proxy would serve each service: any name does, nothing is started. */
const CHECK_HOST = 'setup-check.invalid';

/** The settings to check, on the clone in `workspaceVolume`, under the compose project name `project`. */
export type PreviewCheckTarget = {
  projectId: number;
  config: PreviewConfig;
  project: string;
  workspaceVolume: string;
};

/**
 * A preview's target from the settings alone. The variables keep their templates
 * (`{service.api.url}`): they name a ticket's addresses, and only the file's shape is checked.
 */
function composeTarget(db: Db, check: PreviewCheckTarget): ComposeTarget {
  const { config } = check;
  return {
    project: check.project,
    config,
    workspaceVolume: check.workspaceVolume,
    exposed: exposedServices(config).map((service) => ({
      service: service.name,
      port: service.port,
      host: CHECK_HOST,
    })),
    plain: config.env,
    secrets: previewSecretValues(db, check.projectId),
    shared: config.sharedServices ?? [],
  };
}

/** Why the preview could not start with these settings; null when its file passes every check. */
export async function previewProblem(
  deps: PreviewDeps,
  check: PreviewCheckTarget,
): Promise<string | null> {
  const target = composeTarget(deps.db, check);
  if (target.exposed.length === 0) {
    return 'The preview settings serve no service: name the one to open, with its port';
  }
  try {
    await buildFile(deps, target, false, await readCatalog(deps, target));
    return null;
  } catch (error) {
    if (error instanceof PreviewError) {
      return error.message;
    }
    throw error;
  }
}
