import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';

import type { GitHubAppCredentials, GitHubAuth } from './github-auth';

/**
 * `baseUrl` points the clients at another API (tests); GitHub's by default. `timeoutMs` bounds each
 * attempt (default 30 s); `retries` is how many times a failed attempt is retried (Octokit's default:
 * 3, with growing pauses), so a call fails after about `(retries + 1) × timeoutMs` at most.
 */
export type ClientOptions = { baseUrl?: string; timeoutMs?: number; retries?: number };

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Every request gives up after `ms`. Octokit queues requests per process (token minting and GraphQL
 * one at a time): without a limit, one request stuck on a dead connection blocked every later call
 * until a restart.
 */
function timedFetch(ms: number): typeof fetch {
  const bounded = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const limit = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
    return fetch(input, { ...init, signal });
  };
  return Object.assign(bounded, { preconnect: fetch.preconnect });
}

/** The request and retry settings every client gets. */
function limits(options: ClientOptions): {
  request: { fetch: typeof fetch };
  retry?: { retries: number };
} {
  return {
    request: { fetch: timedFetch(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) },
    ...(options.retries === undefined ? {} : { retry: { retries: options.retries } }),
  };
}

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
  const base = `${options.baseUrl ?? ''}\n${options.timeoutMs ?? ''}\n${options.retries ?? ''}`;
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
      ? new Octokit({
          auth: auth.token,
          baseUrl: options.baseUrl,
          ...limits(options),
        })
      : new Octokit({
          authStrategy: createAppAuth,
          auth: { ...auth.app, installationId: auth.installationId },
          baseUrl: options.baseUrl,
          ...limits(options),
        }),
  );
}

/** Authenticated as the app itself (JWT): `/app` and `/app/installations` endpoints only. */
export function githubAppClient(app: GitHubAppCredentials, options: ClientOptions = {}): Octokit {
  return cached(
    `jwt\n${options.baseUrl ?? ''}\n${options.timeoutMs ?? ''}\n${options.retries ?? ''}\n${app.appId}\n${app.privateKey}`,
    () =>
      new Octokit({
        authStrategy: createAppAuth,
        auth: app,
        baseUrl: options.baseUrl,
        ...limits(options),
      }),
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
