import { afterAll, beforeEach, expect, test } from 'bun:test';
import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

import { createDb, migrateDb, type Db } from './db';
import { deleteGitHubApp, projectGitHubAuth, saveGitHubApp } from './github-auth';
import { gitToken, githubClient } from './github-client';

const APP = { appId: '42', slug: 'union-bot', name: 'Union bot', privateKey: 'pem' };

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('an installation wins over the token; the token over the fallback', () => {
  saveGitHubApp(db, APP);
  expect(projectGitHubAuth(db, { githubToken: 'tok', githubInstallationId: 7 })).toEqual({
    kind: 'app',
    app: { appId: '42', privateKey: 'pem' },
    installationId: 7,
  });
  expect(projectGitHubAuth(db, { githubToken: 'tok', githubInstallationId: null }, 'env')).toEqual({
    kind: 'token',
    token: 'tok',
  });
  expect(projectGitHubAuth(db, { githubToken: null, githubInstallationId: null }, 'env')).toEqual({
    kind: 'token',
    token: 'env',
  });
  expect(projectGitHubAuth(db, { githubToken: null, githubInstallationId: null })).toBeNull();
});

test('an installation without the app has no credentials, even with a fallback', () => {
  saveGitHubApp(db, APP);
  saveGitHubApp(db, { ...APP, name: 'Renamed' });
  deleteGitHubApp(db);
  expect(projectGitHubAuth(db, { githubToken: null, githubInstallationId: 7 }, 'env')).toBeNull();
});

const { privateKey } = await promisify(generateKeyPair)('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const requests: { method: string; path: string; auth: string }[] = [];
const HOUR_MS = 3_600_000;
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    requests.push({
      method: request.method,
      path: pathname,
      auth: request.headers.get('authorization') ?? '',
    });
    if (pathname === '/app/installations/7/access_tokens') {
      return Response.json({
        token: 'ghs_minted',
        expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
        permissions: { contents: 'write' },
        repository_selection: 'selected',
      });
    }
    return Response.json({ login: 'acme' });
  },
});
afterAll(() => {
  void server.stop(true);
});

test('an installation mints a token with the app JWT, caches it and uses it for API calls', async () => {
  const options = { baseUrl: server.url.origin };
  const auth = {
    kind: 'app' as const,
    app: { appId: '42', privateKey },
    installationId: 7,
  };
  expect(await gitToken(auth, options)).toBe('ghs_minted');
  expect(await gitToken(auth, options)).toBe('ghs_minted');
  await githubClient(auth, options).request('GET /users/{username}', { username: 'acme' });

  const minted = requests.filter((request) => request.path.endsWith('/access_tokens'));
  expect(minted).toHaveLength(1);
  expect(minted[0]?.auth).toMatch(/^bearer eyJ/iu);
  expect(requests.at(-1)).toMatchObject({ path: '/users/acme', auth: 'token ghs_minted' });
  expect(await gitToken({ kind: 'token', token: 'ghp_x' })).toBe('ghp_x');
});
