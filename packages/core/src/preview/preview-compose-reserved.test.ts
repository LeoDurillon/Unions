// Tests of the names a preview may not take: build tags of Union's images, and Union-like volume and network names.
import { expect, test } from 'bun:test';

import { composeProblems, type ComposeJson } from './preview-compose-check';
import { imageRepository } from './preview-compose-reserved';

const UNION = { workspaceVolume: 'union-t12-ws', proxyNetwork: 'union-t12-proxy' };

function built(image: string): ComposeJson {
  return { name: 'union-t12', services: { app: { build: { context: '/workspace/repo' }, image } } };
}

function named(kind: 'volumes' | 'networks', name: string): ComposeJson {
  return { name: 'union-t12', services: { app: { image: 'x' } }, [kind]: { data: { name } } };
}

function withProxyNetworkNamed(network: string): ComposeJson {
  return {
    name: 'union-t12',
    services: { app: { image: 'x' } },
    networks: { union_preview: { name: network } },
  };
}

test('an image reference is reduced to its repository', () => {
  expect(imageRepository('docker:29.0.0-cli')).toBe('docker');
  expect(imageRepository('docker.io/library/node:22-slim')).toBe('node');
  expect(imageRepository('Traefik@sha256:abc')).toBe('traefik');
  expect(imageRepository('registry.local:5000/team/app:1')).toBe('registry.local:5000/team/app');
  expect(imageRepository('oven/bun')).toBe('oven/bun');
});

test('a build may not be tagged as an image Union runs or builds from', () => {
  for (const image of [
    'docker:29.0.0-cli',
    'docker.io/library/docker:29.0.0-cli',
    'traefik:v3.6.2',
    'union-agent:local',
    'union-dev:local',
    'UNION-agent-base:local',
    'oven/bun:1.4.1',
    'node:22-slim',
    'debian:bookworm-slim',
  ]) {
    expect(composeProblems(built(image))).toEqual([
      `app: builds into "${image}", an image Union runs`,
    ]);
  }
});

test("a build under the project's own name, and Union's images run unbuilt, pass", () => {
  expect(composeProblems(built('my-app:dev'))).toEqual([]);
  expect(composeProblems(built('ghcr.io/team/node-tools:1'))).toEqual([]);
  expect(composeProblems({ services: { db: { image: 'node:22' } } })).toEqual([]);
});

test("volumes and networks may not take another preview's or Union's names", () => {
  expect(composeProblems(named('volumes', 'union-t7-ws'))).toEqual([
    'volume "data" is named "union-t7-ws", a name Union uses',
  ]);
  expect(composeProblems(named('volumes', 'union-t7_data'))).toHaveLength(1);
  expect(composeProblems(named('networks', 'union-preview'))).toEqual([
    'network "data" is named "union-preview", a name Union uses',
  ]);
  // The names compose gives the project's own, and any name outside Union's.
  expect(composeProblems(named('volumes', 'union-t12_data'))).toEqual([]);
  expect(composeProblems(named('networks', 'union-t12_data'))).toEqual([]);
  expect(composeProblems(named('volumes', 'shop_pgdata'))).toEqual([]);
});

test("Union's keys may name only this ticket's workspace and proxy network", () => {
  expect(composeProblems(withProxyNetworkNamed('union-t12-proxy'), UNION)).toEqual([]);
  expect(composeProblems(withProxyNetworkNamed('union-t7-proxy'), UNION)).toEqual([
    'network "union_preview" is named "union-t7-proxy", a name Union uses',
  ]);
});

test('a provider service is refused: compose would run its binary in the helper', () => {
  expect(
    composeProblems({ services: { model: { provider: { type: 'model', options: {} } } } }),
  ).toEqual(['model: provider is not allowed']);
});
