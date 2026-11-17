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

test("a service's paths go on the host they are on, longest first; a host without an address has none", () => {
  const config = {
    composeFile: 'compose.yaml',
    env: {},
    services: [
      { name: 'web', port: 3000, prefix: '' },
      { name: 'admin', port: 3001, prefix: 'admin' },
      {
        name: 'api',
        port: 4000,
        prefix: 'api',
        paths: [
          { host: '', path: '/api', strip: true },
          { host: '', path: '/api/v2', strip: false },
          { host: 'admin', path: '/api', strip: true },
        ],
      },
    ],
  };
  expect(
    previewRoutes(
      [
        { service: 'web', url: 'http://t12.union.localhost:8080' },
        { service: 'api', url: 'http://api-t12.union.localhost:8080' },
      ],
      config,
    ),
  ).toEqual({
    port: 8080,
    hosts: {
      't12.union.localhost': {
        service: 'web',
        port: 3000,
        paths: [
          { path: '/api/v2', strip: false, service: 'api', port: 4000 },
          { path: '/api', strip: true, service: 'api', port: 4000 },
        ],
      },
      'api-t12.union.localhost': { service: 'api', port: 4000 },
    },
  });
});
