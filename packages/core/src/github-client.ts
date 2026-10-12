import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';

import type { GitHubAppCredentials, GitHubAuth } from './github-auth';

/** `baseUrl` points the clients at another API (tests); GitHub's by default. */
export type ClientOptions = { baseUrl?: string };

const clients = new Map<string, Octokit>();

function cached(key: string, build: () => Octokit): Octokit {
  const known = clients.get(key);
  if (known) {
    return known;
  }
  const client = build();
  clients.set(key, client);
  return client;
}

function keyOf(auth: GitHubAuth, options: ClientOptions): string {
  const base = options.baseUrl ?? '';
  return auth.kind === 'token'
    ? `token\n${base}\n${auth.token}`
    : `app\n${base}\n${auth.app.appId}\n${auth.installationId}\n${auth.app.privateKey}`;
}

/**
 * One client per credential, kept for the process: an installation client mints its own
 * short-lived token (one hour) and refreshes it before it expires, so it must be reused.
 */
export function githubClient(auth: GitHubAuth, options: ClientOptions = {}): Octokit {
  return cached(keyOf(auth, options), () =>
    auth.kind === 'token'
      ? new Octokit({ auth: auth.token, baseUrl: options.baseUrl })
      : new Octokit({
          authStrategy: createAppAuth,
          auth: { ...auth.app, installationId: auth.installationId },
          baseUrl: options.baseUrl,
        }),
  );
}

/** Authenticated as the app itself (JWT): `/app` and `/app/installations` endpoints only. */
export function githubAppClient(app: GitHubAppCredentials, options: ClientOptions = {}): Octokit {
  return cached(
    `jwt\n${options.baseUrl ?? ''}\n${app.appId}\n${app.privateKey}`,
    () => new Octokit({ authStrategy: createAppAuth, auth: app, baseUrl: options.baseUrl }),
  );
}

/**
 * The secret git uses over HTTPS (`x-access-token:<secret>`). For an installation it is a fresh or
 * cached installation token, valid at least a few minutes: enough for one clone or push.
 */
export async function gitToken(auth: GitHubAuth, options: ClientOptions = {}): Promise<string> {
  if (auth.kind === 'token') {
    return auth.token;
  }
  const result: unknown = await githubClient(auth, options).auth({ type: 'installation' });
  if (
    typeof result === 'object' &&
    result !== null &&
    'token' in result &&
    typeof result.token === 'string'
  ) {
    return result.token;
  }
  throw new Error(`GitHub App installation ${auth.installationId} returned no token`);
}
