// One client per credential, kept for the process: an installation client mints its own short-lived
// token (one hour) and refreshes it before it expires, so it must be reused.
import { createAppAuth } from '@octokit/auth-app';
import { Octokit, RequestError } from 'octokit';

import type { GitHubAppCredentials, GitHubAuth } from './github-auth';

/**
 * `baseUrl` points the clients at another API (tests); GitHub's by default. `timeoutMs` bounds each
 * attempt (default 30 s); `retries` is how many times a failed attempt is retried (Octokit's default:
 * 3, with growing pauses), so a call fails after about `(retries + 1) × timeoutMs` at most.
 * `deadlineMs` bounds the whole call, including the time spent before any attempt: waiting in
 * Octokit's queues or on an installation token. `throttled: false` drops Octokit's throttling, whose
 * queues every client of the process shares.
 */
export type ClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  deadlineMs?: number;
  throttled?: boolean;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const GATEWAY_TIMEOUT = 504;

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

/** The request, retry and throttling settings every client gets. */
function limits(options: ClientOptions): {
  request: { fetch: typeof fetch };
  retry?: { retries: number };
  throttle?: { enabled: false };
} {
  return {
    request: { fetch: timedFetch(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) },
    ...(options.retries === undefined ? {} : { retry: { retries: options.retries } }),
    ...(options.throttled === false ? { throttle: { enabled: false } } : {}),
  };
}

/**
 * Wrapped after the plugins, so it runs outside retries, throttling and token minting: a call
 * stuck in one of them still fails, as a 504, once `ms` have passed.
 */
function withDeadline(octokit: Octokit, ms: number | undefined): Octokit {
  if (ms === undefined) {
    return octokit;
  }
  octokit.hook.wrap('request', (request, options) => {
    const deadline = AbortSignal.timeout(ms);
    const expired = new Promise<never>((_resolve, reject) => {
      deadline.addEventListener('abort', () => {
        const message = `GitHub did not answer ${options.method} ${options.url} within ${ms} ms`;
        reject(new RequestError(message, GATEWAY_TIMEOUT, { request: options }));
      });
    });
    return Promise.race([request(options), expired]);
  });
  return octokit;
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

function settingsKey(options: ClientOptions): string {
  const { baseUrl, timeoutMs, retries, deadlineMs, throttled } = options;
  return [baseUrl, timeoutMs, retries, deadlineMs, throttled]
    .map((value) => value ?? '')
    .join('\n');
}

function keyOf(auth: GitHubAuth, options: ClientOptions): string {
  const base = settingsKey(options);
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
    withDeadline(
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
      options.deadlineMs,
    ),
  );
}

/** Authenticated as the app itself (JWT): `/app` and `/app/installations` endpoints only. */
export function githubAppClient(app: GitHubAppCredentials, options: ClientOptions = {}): Octokit {
  return cached(`jwt\n${settingsKey(options)}\n${app.appId}\n${app.privateKey}`, () =>
    withDeadline(
      new Octokit({
        authStrategy: createAppAuth,
        auth: app,
        baseUrl: options.baseUrl,
        ...limits(options),
      }),
      options.deadlineMs,
    ),
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
