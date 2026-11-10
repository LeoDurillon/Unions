// Tests for taking the shared services out of a preview's file, and the shared project's file.
import { expect, test } from 'bun:test';

import type { ComposeJson } from './preview-compose-check';
import {
  SHARED_KEY,
  sharedPart,
  sharedProject,
  sharedStackFile,
  splitShared,
  withSharedInline,
} from './preview-shared';

const CONTEXT = { exposed: ['api'], variables: ['API_URL'] };

/** As `docker compose -p union-t41 config --format json` resolves it. */
const RESOLVED: ComposeJson = {
  name: 'union-t41',
  networks: { default: { name: 'union-t41_default' } },
  services: {
    api: {
      image: 'api',
      depends_on: {
        clamav: { condition: 'service_healthy', required: true },
        db: { condition: 'service_started', required: true },
      },
      links: ['clamav', 'db'],
      networks: { default: null },
    },
    db: { image: 'postgres', networks: { default: null } },
    clamav: {
      image: 'clamav/clamav',
      container_name: 'clamav',
      environment: {
        API_URL: 'http://api-t41.union.localhost:8080',
        CLAMAV_NO_FRESHCLAMD: 'false',
      },
      healthcheck: { test: ['CMD', 'clamdcheck'] },
      labels: { team: 'back', 'traefik.enable': 'true' },
      networks: { default: null },
      ports: [{ target: 3310, published: '3310', protocol: 'tcp' }],
      volumes: [{ type: 'volume', source: 'clamdb', target: '/var/lib/clamav' }],
    },
  },
  volumes: { clamdb: { name: 'union-t41_clamdb' }, pgdata: { name: 'union-t41_pgdata' } },
};

test('a shared service leaves the preview, and the others stop waiting for it', () => {
  const { file, problems } = splitShared(RESOLVED, ['clamav'], CONTEXT);
  expect(problems).toEqual([]);
  const services = file.services as Record<string, Record<string, unknown>>;
  expect(Object.keys(services)).toEqual(['api', 'db']);
  expect(services.api?.depends_on).toEqual({
    db: { condition: 'service_started', required: true },
  });
  expect(services.api?.links).toEqual(['db']);
  expect(file.volumes).toEqual({});
});

test('the shared project runs it on its own network, under its own names, ports kept for the agent', () => {
  const { file } = splitShared(RESOLVED, ['clamav'], CONTEXT);
  expect(sharedStackFile(file, 1)).toEqual({
    name: 'union-p1-shared',
    services: {
      clamav: {
        image: 'clamav/clamav',
        environment: { CLAMAV_NO_FRESHCLAMD: 'false' },
        healthcheck: { test: ['CMD', 'clamdcheck'] },
        labels: { team: 'back' },
        'x-union-ports': [{ target: 3310, published: '3310', protocol: 'tcp' }],
        volumes: [{ type: 'volume', source: 'clamdb', target: '/var/lib/clamav' }],
      },
    },
    volumes: { clamdb: {} },
  });
  expect(sharedProject(1)).toBe('union-p1-shared');
});

test('a file that shares nothing is left as it is', () => {
  expect(splitShared(RESOLVED, [], CONTEXT).file).toBe(RESOLVED);
  expect(splitShared(RESOLVED, ['mailhog'], CONTEXT).file).toBe(RESOLVED);
  expect(sharedStackFile(RESOLVED, 1)).toBeNull();
  expect(sharedPart(RESOLVED)).toBeNull();
});

test('what cannot run outside the preview is refused, with the reason', () => {
  const resolved: ComposeJson = {
    services: {
      api: { image: 'api', networks: { default: null } },
      cache: { image: 'redis' },
      mailhog: { image: 'mailhog', depends_on: { cache: { condition: 'service_started' } } },
      worker: { build: { context: '/workspace/repo' } },
      scanner: {
        image: 'scanner',
        volumes: [{ type: 'bind', source: '/workspace/repo/rules', target: '/rules' }],
      },
      sidecar: { image: 'sidecar', network_mode: 'service:scanner' },
    },
  };
  expect(splitShared(resolved, ['api', 'mailhog', 'worker', 'scanner'], CONTEXT).problems).toEqual([
    'api: the proxy serves it, so it cannot be shared',
    'mailhog: depends on "cache", which is not shared',
    'worker: builds its image from the repository; a shared service runs an image',
    'scanner: mounts /workspace/repo/rules from the repository, which a shared service cannot',
    'sidecar: uses the network of "scanner", which is shared',
  ]);
});

test('a file whose owner may not share runs its own copies', () => {
  const { file } = splitShared(RESOLVED, ['clamav'], CONTEXT);
  const inline = withSharedInline(file);
  expect(inline[SHARED_KEY]).toBeUndefined();
  expect(Object.keys(inline.services as object)).toEqual(['api', 'db', 'clamav']);
  expect(inline.volumes).toEqual({ clamdb: {} });
  expect(withSharedInline(RESOLVED)).toEqual(RESOLVED);
});
