import { eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './schema';

export type GitHubAppRow = typeof schema.githubApp.$inferSelect;
export type GitHubAppCredentials = { appId: string; privateKey: string };

/** How a project reaches GitHub: a personal access token or an installation of the GitHub App. */
export type GitHubAuth =
  | { kind: 'token'; token: string }
  | { kind: 'app'; app: GitHubAppCredentials; installationId: number };

const APP_ROW = 1;

export function getGitHubApp(db: Db): GitHubAppRow | null {
  return db.select().from(schema.githubApp).where(eq(schema.githubApp.id, APP_ROW)).get() ?? null;
}

export function saveGitHubApp(
  db: Db,
  app: { appId: string; slug: string; name: string; privateKey: string },
): GitHubAppRow {
  return db
    .insert(schema.githubApp)
    .values({ id: APP_ROW, ...app })
    .onConflictDoUpdate({ target: schema.githubApp.id, set: app })
    .returning()
    .get();
}

export function deleteGitHubApp(db: Db): void {
  db.delete(schema.githubApp).where(eq(schema.githubApp.id, APP_ROW)).run();
}

export function appAuth(app: GitHubAppRow, installationId: number): GitHubAuth {
  return {
    kind: 'app',
    app: { appId: app.appId, privateKey: app.privateKey },
    installationId,
  };
}

/**
 * A project's installation wins over its token; `fallbackToken` (the `GITHUB_TOKEN` environment
 * variable) covers projects with neither. Null when nothing applies, including an installation whose
 * app was removed.
 */
export function projectGitHubAuth(
  db: Db,
  project: { githubToken: string | null; githubInstallationId: number | null },
  fallbackToken?: string,
): GitHubAuth | null {
  if (project.githubInstallationId !== null) {
    const app = getGitHubApp(db);
    return app ? appAuth(app, project.githubInstallationId) : null;
  }
  const token = project.githubToken ?? fallbackToken;
  return token ? { kind: 'token', token } : null;
}
