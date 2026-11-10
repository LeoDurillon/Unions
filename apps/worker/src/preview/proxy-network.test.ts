// Tests for putting Union's proxy on a preview's own proxy network, and taking it off.
import { beforeEach, expect, test } from 'bun:test';

import type { ContainerRuntime } from '@union/core';

import { joinProxy, leaveProxy } from './proxy-network';

let networks: string[];
let proxies: string[];
let calls: string[];

const runtime = {
  networkExists: (name: string) => Promise.resolve(networks.includes(name)),
  serviceContainers: (network: string, service: string) => {
    calls.push(`find ${service} on ${network}`);
    return Promise.resolve(proxies);
  },
  connectNetwork: (network: string, container: string) => {
    calls.push(`join ${network} ${container}`);
    return Promise.resolve();
  },
  networkContainers: () => Promise.resolve([]),
  containerNetworks: () => Promise.resolve([]),
  disconnectNetwork: (network: string, container: string) => {
    calls.push(`leave ${network} ${container}`);
    return Promise.resolve();
  },
} as unknown as ContainerRuntime;

beforeEach(() => {
  networks = ['union-preview', 'union-t1-proxy'];
  proxies = ['union-next-proxy-1'];
  calls = [];
});

test("the proxy joins the preview's own network after up, and leaves it before down", async () => {
  await joinProxy(runtime, 'union-t1');
  await leaveProxy(runtime, 'union-t1');
  expect(calls).toEqual([
    'find proxy on union-preview',
    'join union-t1-proxy union-next-proxy-1',
    'find proxy on union-preview',
    'leave union-t1-proxy union-next-proxy-1',
  ]);
});

test("a preview's own service named proxy is never taken for Union's", async () => {
  proxies = ['union-t2-proxy-1', 'union-next-proxy-1'];
  await joinProxy(runtime, 'union-t1');
  expect(calls.at(-1)).toBe('join union-t1-proxy union-next-proxy-1');
  expect(calls).toHaveLength(2);
});

test('without a proxy network (nothing exposed) nothing joins or leaves', async () => {
  await joinProxy(runtime, 'union-t3');
  await leaveProxy(runtime, 'union-t3');
  expect(calls).toEqual([]);
});

test('a start the proxy cannot reach fails, rather than waiting for services nobody serves', async () => {
  proxies = [];
  const failure = await joinProxy(runtime, 'union-t1').catch((error: unknown) => error);
  expect(String(failure)).toContain('is not on the union-preview network');
});
