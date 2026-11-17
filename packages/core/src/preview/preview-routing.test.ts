// Tests for the Traefik labels of an exposed preview service, its paths on other hosts included.
import { expect, test } from 'bun:test';

import { previewRouting } from './preview-routing';

test('a service without paths gets its host router only', () => {
  expect(
    previewRouting('union-t12', { service: 'web', port: 80, host: 't12.union.localhost' }),
  ).toEqual({
    'traefik.enable': 'true',
    'traefik.docker.network': 'union-t12-proxy',
    'traefik.http.routers.union-t12-web.rule': 'Host(`t12.union.localhost`)',
    'traefik.http.routers.union-t12-web.entrypoints': 'web',
    'traefik.http.services.union-t12-web.loadbalancer.server.port': '80',
  });
});

test('each path is a router on the other host, to the same service, stripped when asked', () => {
  const labels = previewRouting('union-r3', {
    service: 'api',
    port: 3000,
    host: 'api-r3.union.localhost',
    paths: [
      { host: 'r3.union.localhost', path: '/api', strip: true },
      { host: 'viewer-r3.union.localhost', path: '/api/v2', strip: false },
    ],
  });
  expect(labels).toMatchObject({
    'traefik.http.routers.union-r3-api.rule': 'Host(`api-r3.union.localhost`)',
    'traefik.http.routers.union-r3-api-path1.rule':
      'Host(`r3.union.localhost`) && (Path(`/api`) || PathPrefix(`/api/`))',
    'traefik.http.routers.union-r3-api-path1.entrypoints': 'web',
    'traefik.http.routers.union-r3-api-path1.priority': '10004',
    'traefik.http.routers.union-r3-api-path1.service': 'union-r3-api',
    'traefik.http.routers.union-r3-api-path1.middlewares': 'union-r3-api-path1-strip',
    'traefik.http.middlewares.union-r3-api-path1-strip.stripprefix.prefixes': '/api',
    'traefik.http.routers.union-r3-api-path2.rule':
      'Host(`viewer-r3.union.localhost`) && (Path(`/api/v2`) || PathPrefix(`/api/v2/`))',
    'traefik.http.routers.union-r3-api-path2.priority': '10007',
    'traefik.http.routers.union-r3-api-path2.service': 'union-r3-api',
  });
  expect(labels).not.toHaveProperty('traefik.http.routers.union-r3-api-path2.middlewares');
  // One load balancer: the path routers use the host router's service.
  expect(Object.keys(labels).filter((key) => key.startsWith('traefik.http.services.'))).toEqual([
    'traefik.http.services.union-r3-api.loadbalancer.server.port',
  ]);
});
