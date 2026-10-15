import { expect, test } from 'bun:test';

import { agentForwards, agentVariables, PUBLISHED_PORTS_KEY } from './agent-environment';
import { previewCompose } from './preview-compose';

/** Senova's agent services, as `config --format json` prints them. */
const resolved = {
  services: {
    db: {
      image: 'postgres',
      ports: [{ mode: 'ingress', target: 5432, published: '5432', protocol: 'tcp' }],
    },
    s3: {
      image: 'minio',
      ports: [
        { target: 9000, published: '9000', protocol: 'tcp' },
        { target: 9001, published: '9001', protocol: 'tcp', host_ip: '127.0.0.1' },
      ],
    },
    mailhog: {
      image: 'mailhog',
      ports: [
        { target: 1025, published: '1025' },
        { target: 8025, protocol: 'udp' },
      ],
    },
    clamav: { image: 'clamav', ports: [{ target: 3310 }] },
    api: { image: 'node', ports: [{ target: 3000, published: '3000', protocol: 'tcp' }] },
  },
};

test('the agent services published ports are forwarded; other services and UDP are not', () => {
  expect(agentForwards(resolved, ['db', 's3', 'mailhog', 'clamav'])).toEqual({
    forwards: [
      { service: 'db', port: 5432, targetPort: 5432 },
      { service: 's3', port: 9000, targetPort: 9000 },
      { service: 's3', port: 9001, targetPort: 9001 },
      { service: 'mailhog', port: 1025, targetPort: 1025 },
      { service: 'clamav', port: 3310, targetPort: 3310 },
    ],
    problems: [],
  });
});

test('another published number, a range, and a port two services publish', () => {
  const file = {
    services: {
      db: { ports: [{ target: 5432, published: '15432' }] },
      other: {
        ports: [
          { target: 5432, published: '15432' },
          { target: '7000-7001', published: '8000-8001' },
        ],
      },
    },
  };
  expect(agentForwards(file, ['db', 'other', 'missing'])).toEqual({
    forwards: [
      { service: 'db', port: 15_432, targetPort: 5432 },
      { service: 'other', port: 8000, targetPort: 7000 },
      { service: 'other', port: 8001, targetPort: 7001 },
    ],
    problems: ["Port 15432 of other is already db's"],
  });
});

test('the preview file keeps the published ports aside, and they are read from there', () => {
  const file = previewCompose(resolved, {
    project: 'union-t1',
    workspaceVolume: 'union-t1-ws',
    exposed: [],
    variables: [],
  });
  const services = file.services as Record<string, Record<string, unknown>>;
  expect(services.db).not.toHaveProperty('ports');
  expect(services.db?.[PUBLISHED_PORTS_KEY]).toEqual(resolved.services.db.ports);
  expect(agentForwards(file, ['db']).forwards).toEqual([
    { service: 'db', port: 5432, targetPort: 5432 },
  ]);
});

test('the agent gets every plain variable, none, or the chosen ones', () => {
  const plain = { DATABASE_URL: 'postgres://db', S3_URL: 'http://s3:9000' };
  expect(agentVariables(plain)).toEqual(plain);
  expect(agentVariables(plain, { mode: 'all' })).toEqual(plain);
  expect(agentVariables(plain, { mode: 'none', names: ['S3_URL'] })).toEqual({});
  expect(agentVariables(plain, { mode: 'chosen', names: ['S3_URL', 'GONE'] })).toEqual({
    S3_URL: 'http://s3:9000',
  });
});
