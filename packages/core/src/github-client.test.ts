import { afterAll, beforeAll, expect, test } from 'bun:test';
import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

import { githubClient } from './github-client';

/** A GitHub that accepts connections and never answers, like a request stuck on a dead connection. */
const silent = Bun.serve({
  port: 0,
  fetch: () =>
    new Promise<Response>(() => {
      // Never answers.
    }),
});
const baseUrl = `http://localhost:${silent.port}`;

afterAll(async () => {
  await silent.stop(true);
});

let privateKey = '';

beforeAll(async () => {
  ({ privateKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }));
});

async function settlesWithin(work: Promise<unknown>, ms: number): Promise<string> {
  const outcome = await Promise.race([
    work.then(
      () => 'resolved',
      () => 'rejected',
    ),
    Bun.sleep(ms).then(() => 'still waiting'),
  ]);
  return outcome;
}

test('a request GitHub never answers fails after the timeout instead of hanging', async () => {
  const client = githubClient(
    { kind: 'token', token: 't' },
    { baseUrl, timeoutMs: 200, retries: 0 },
  );
  expect(await settlesWithin(client.request('GET /zen'), 3000)).toBe('rejected');
});

test('an installation token GitHub never mints fails too, so it cannot block the next calls', async () => {
  const auth = {
    kind: 'app' as const,
    app: { appId: '1', privateKey },
    installationId: 7,
  };
  const client = githubClient(auth, { baseUrl, timeoutMs: 200, retries: 0 });
  expect(await settlesWithin(client.request('GET /repos/o/r'), 3000)).toBe('rejected');
  // The next call is not stuck behind the first one.
  expect(await settlesWithin(client.request('GET /repos/o/r'), 3000)).toBe('rejected');
});

test('with retries, a call that never gets an answer still ends, after each attempt timed out', async () => {
  const client = githubClient(
    { kind: 'token', token: 'r' },
    { baseUrl, timeoutMs: 100, retries: 1 },
  );
  expect(await settlesWithin(client.request('GET /zen'), 5000)).toBe('rejected');
});
