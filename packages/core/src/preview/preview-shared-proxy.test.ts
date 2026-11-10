// Tests for opening shared services' web pages through the proxy, one address per project.
import { expect, test } from 'bun:test';

import { sharedServiceHost, sharedUrls, withSharedRoutes } from './preview-shared-proxy';

const STACK = {
  name: 'union-p1-shared',
  services: { s3: { image: 'pgsty/silo:latest' }, clamav: { image: 'clamav/clamav' } },
};

test('a host per shared service and project, from a name a host may hold', () => {
  expect(sharedServiceHost(1, 's3')).toBe('s3-p1.union.localhost');
  expect(sharedServiceHost(2, 'Mail_Hog.dev')).toBe('mail-hog-dev-p2.union.localhost');
  expect(sharedUrls(1, [{ service: 's3', port: 9001 }], ['s3'], 8080)).toEqual([
    { service: 's3', url: 'http://s3-p1.union.localhost:8080' },
  ]);
  expect(sharedUrls(1, [{ service: 's3', port: 9001 }], [], 8080)).toEqual([]);
});

test("an opened service is labelled for the proxy, on the project's own proxy network only", () => {
  const routed = withSharedRoutes(STACK, 1, [
    { service: 's3', port: 9001 },
    { service: 'gone', port: 1 },
  ]);
  expect(routed.networks).toEqual({ union_preview: { name: 'union-p1-shared-proxy' } });
  const services = routed.services as Record<string, Record<string, unknown>>;
  expect(services.s3?.networks).toEqual({ default: null, union_preview: null });
  expect(services.s3?.labels).toEqual({
    'traefik.enable': 'true',
    'traefik.docker.network': 'union-p1-shared-proxy',
    'traefik.http.routers.union-p1-shared-s3.rule': 'Host(`s3-p1.union.localhost`)',
    'traefik.http.routers.union-p1-shared-s3.entrypoints': 'web',
    'traefik.http.services.union-p1-shared-s3.loadbalancer.server.port': '9001',
  });
  expect(services.clamav).toEqual({ image: 'clamav/clamav' });
  expect(withSharedRoutes(STACK, 1, [])).toBe(STACK);
});
