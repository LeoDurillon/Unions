import { expect, test } from 'bun:test';

import type { Preview } from '@union/core';

import { serviceRows } from './preview-services';

const SERVICES = [
  { name: 'back', port: 3000, prefix: 'api' },
  { name: 'front', port: 5173, prefix: '' },
];

function preview(change: Partial<Preview>): Preview {
  return { status: 'running', url: null, urls: null, ...change } as Preview;
}

test('the settings give the rows, with each address while the preview runs', () => {
  const running = preview({
    urls: [
      { service: 'back', url: 'http://api-t1.union.localhost' },
      { service: 'front', url: 'http://t1.union.localhost' },
    ],
  });
  expect(serviceRows(SERVICES, running)).toEqual([
    { name: 'back', port: 3000, url: 'http://api-t1.union.localhost' },
    { name: 'front', port: 5173, url: 'http://t1.union.localhost' },
  ]);
});

test('a preview not running shows no address', () => {
  const failed = preview({
    status: 'failed',
    url: 'http://x',
    urls: [{ service: 'back', url: 'http://x' }],
  });
  expect(serviceRows(SERVICES, failed).map((row) => row.url)).toEqual([null, null]);
  expect(serviceRows(SERVICES, null).map((row) => row.name)).toEqual(['back', 'front']);
});

test('without settings the rows come from the addresses, without a port', () => {
  const running = preview({
    url: 'http://t1.union.localhost',
    urls: [{ service: '', url: 'http://t1.union.localhost' }],
  });
  expect(serviceRows([], running)).toEqual([
    { name: 'app', port: null, url: 'http://t1.union.localhost' },
  ]);
});
