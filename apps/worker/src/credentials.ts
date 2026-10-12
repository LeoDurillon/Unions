import { projectGitHubAuth, type Db, type Project } from '@union/core';
import { gitToken } from '@union/core/github-client';

/**
 * The secret the host's git uses to clone and push, minted right before use (an installation token
 * lives one hour). Null when the project has no credentials: public repositories still clone.
 */
export function projectGitToken(db: Db, project: Project): Promise<string | null> {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  return auth ? gitToken(auth) : Promise.resolve(null);
}
