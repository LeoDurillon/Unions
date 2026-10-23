import { expect, test } from 'bun:test';

import { previewRoutes } from './host-routes';

const CONFIG = {
  composeFile: 'compose.yaml',
  env: {},
  services: [
    { name: 'web', port: 3000, prefix: '' },
    { name: 'api', port: 4000, prefix: 'api' },
  ],
};

test("each public address's host goes to its service's own port, on the address's port", () => {
  expect(
    previewRoutes(
      [
        { service: 'web', url: 'http://t12.union.localhost:8080' },
        { service: 'api', url: 'http://api-t12.union.localhost:8080' },
      ],
      CONFIG,
    ),
  ).toEqual({
    port: 8080,
    hosts: {
      't12.union.localhost': { service: 'web', port: 3000 },
      'api-t12.union.localhost': { service: 'api', port: 4000 },
    },
  });
});

test('an address without a port is on 80; a service no longer exposed is left out', () => {
  expect(
    previewRoutes(
      [
        { service: 'web', url: 'http://t12.union.localhost' },
        { service: 'gone', url: 'http://gone-t12.union.localhost' },
      ],
      CONFIG,
    ),
  ).toEqual({ port: 80, hosts: { 't12.union.localhost': { service: 'web', port: 3000 } } });
  expect(previewRoutes([], CONFIG)).toBeNull();
});
