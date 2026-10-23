// Tests for the checks that the preview proxy, and the services behind it, answer.
import { expect, test } from 'bun:test';

import { proxyAnswers } from './ready';

function notFound(): Promise<Response> {
  return Promise.resolve(new Response('404 page not found', { status: 404 }));
}

function refused(): Promise<Response> {
  return Promise.reject(new Error('ECONNREFUSED'));
}

test('the proxy runs when it answers anything, its own 404 included', async () => {
  expect(await proxyAnswers('http://proxy', 100, notFound)).toBe(true);
});

test('the proxy does not run when nothing answers', async () => {
  expect(await proxyAnswers('http://proxy', 100, refused)).toBe(false);
});
