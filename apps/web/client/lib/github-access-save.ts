// Changing how a project reaches GitHub: a token or an installation, verified against GitHub before it is stored.
import type { PublicProject } from '../../src/api-types';
import { api } from './api';
import { blockingScopes, hasBoard } from './github-project-api';

/** Saved only when nothing needed is missing: `project` counts only with a GitHub Project. */
export async function saveToken(
  project: PublicProject,
  token: string,
): Promise<{ login: string; missing: string[] }> {
  const viewer = await api.github.verify({ token });
  const missing = blockingScopes(viewer.missingScopes, hasBoard(project));
  if (missing.length === 0) {
    await api.updateProject(project.id, { token });
  }
  return { login: viewer.login, missing };
}

export async function saveInstallation(
  project: PublicProject,
  installationId: number,
): Promise<void> {
  await api.github.verify({ installationId });
  await api.updateProject(project.id, { installationId });
}
