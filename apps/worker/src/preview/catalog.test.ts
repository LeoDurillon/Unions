import { expect, test } from 'bun:test';

import type { ContainerRuntime, ExecResult, HelperSpec } from '@union/core';

import { catalogSummary, profileArgs, profileHint, readCatalog } from './catalog';
import { previewSettings } from './compose';
import type { PreviewDeps, Target } from './target';

const CATALOG = {
  services: { web: [], s3: ['storage', 'full'], worker: ['jobs'] },
};

test('the profiles chosen become --profile arguments', () => {
  const target = { config: { profiles: ['storage', 'jobs'] } } as unknown as Target;
  expect(profileArgs(target)).toEqual(['--profile', 'storage', '--profile', 'jobs']);
  expect(profileArgs({ config: {} } as unknown as Target)).toEqual([]);
});

test('the settings are offered every profile and every service', () => {
  expect(catalogSummary(CATALOG)).toEqual({
    profiles: ['full', 'jobs', 'storage'],
    services: ['web', 's3', 'worker'],
  });
});

test('a service missing because of its profiles says which to enable', () => {
  expect(profileHint(CATALOG, 's3')).toBe(
    '"s3" is only in profiles storage, full: enable one in the Preview settings',
  );
  expect(profileHint(CATALOG, 'worker')).toContain('only in profile jobs:');
  // Always enabled, or unknown: the usual message stands.
  expect(profileHint(CATALOG, 'web')).toBeNull();
  expect(profileHint(CATALOG, 'api')).toBeNull();
});

test('the catalog reads the file with every profile enabled', async () => {
  const calls: HelperSpec[] = [];
  const runtime = {
    async *runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
      calls.push(spec);
      await Promise.resolve();
      yield JSON.stringify({ services: { web: {}, s3: { profiles: ['storage'] } } });
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
  const deps = { runtime, settings: previewSettings({}) } as unknown as PreviewDeps;
  const target = {
    project: 'union-t1',
    workspaceVolume: 'union-t1-ws',
    config: { composeFile: 'compose.yaml' },
    plain: {},
    secrets: {},
  } as unknown as Target;
  expect(await readCatalog(deps, target)).toEqual({ services: { web: [], s3: ['storage'] } });
  expect(calls[0]?.command.slice(4)).toEqual([
    '-p',
    'union-t1',
    '--profile',
    '*',
    '-f',
    'compose.yaml',
    'config',
    '--format',
    'json',
  ]);
});
