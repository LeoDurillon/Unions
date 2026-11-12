import { expect, test } from 'bun:test';

import { dockerfileBases, parseAgentImageSource } from '@union/core';

import { STARTERS } from '../client/lib/settings/agent-image-starters';

test('every starter passes the check, and only JavaScript carries the JavaScript toolchains', () => {
  for (const starter of STARTERS) {
    expect(parseAgentImageSource({ kind: 'dockerfile', dockerfile: starter.dockerfile }).kind).toBe(
      'dockerfile',
    );
    expect(dockerfileBases(starter.dockerfile)).toEqual([
      starter.id === 'javascript' ? 'union-agent' : 'union-agent-base',
    ]);
  }
});

test('no starter installs a toolchain under the HOME volume', () => {
  for (const starter of STARTERS) {
    expect(starter.dockerfile).not.toContain('/home/node');
    expect(starter.dockerfile).not.toContain('install.sh');
  }
});
