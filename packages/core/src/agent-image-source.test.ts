import { describe, expect, test } from 'bun:test';

import {
  AgentImageError,
  agentImageTag,
  buildableDockerfile,
  parseAgentImageSource,
} from './agent-image-source';

describe('parseAgentImageSource', () => {
  test('takes a Dockerfile that starts from the base image, after comments', () => {
    const dockerfile = '# syntax=docker/dockerfile:1\n\nFROM union-agent\nUSER root\nRUN true';
    expect(parseAgentImageSource({ kind: 'dockerfile', dockerfile })).toEqual({
      kind: 'dockerfile',
      dockerfile: `${dockerfile}\n`,
    });
  });

  test('takes a named first stage', () => {
    const source = parseAgentImageSource({
      kind: 'dockerfile',
      dockerfile: 'from union-agent AS base\n',
    });
    expect(source.kind).toBe('dockerfile');
  });

  test('refuses a Dockerfile from another image, or an empty one', () => {
    expect(() =>
      parseAgentImageSource({ kind: 'dockerfile', dockerfile: 'FROM ubuntu\n' }),
    ).toThrow(AgentImageError);
    expect(() =>
      parseAgentImageSource({ kind: 'dockerfile', dockerfile: 'FROM union-agent:2\n' }),
    ).toThrow(AgentImageError);
    expect(() => parseAgentImageSource({ kind: 'dockerfile', dockerfile: '  \n' })).toThrow(
      AgentImageError,
    );
  });

  test('checks an image name', () => {
    expect(parseAgentImageSource({ kind: 'image', ref: ' ghcr.io/org/img:1.2 ' })).toEqual({
      kind: 'image',
      ref: 'ghcr.io/org/img:1.2',
    });
    expect(() => parseAgentImageSource({ kind: 'image', ref: '--privileged' })).toThrow(
      AgentImageError,
    );
    expect(() => parseAgentImageSource({ kind: 'image', ref: 'a b' })).toThrow(AgentImageError);
  });

  test('takes the default and refuses an unknown kind', () => {
    expect(parseAgentImageSource({ kind: 'default' })).toEqual({ kind: 'default' });
    expect(() => parseAgentImageSource({ kind: 'other' })).toThrow(AgentImageError);
  });
});

describe('buildableDockerfile', () => {
  test('starts every base stage from the base image the worker has', () => {
    const built = buildableDockerfile(
      '# syntax=docker/dockerfile:1\nFROM union-agent AS tools\nRUN true\nFROM union-agent\nCOPY --from=tools /a /a\n',
      'union-agent:local',
    );
    expect(built).toBe(
      '# syntax=docker/dockerfile:1\nFROM union-agent:local AS tools\nRUN true\nFROM union-agent:local\nCOPY --from=tools /a /a\n',
    );
  });
});

describe('agentImageTag', () => {
  test('changes with the Dockerfile and with the base image', () => {
    const tag = agentImageTag(3, 'FROM union-agent\n', 'sha256:a');
    expect(tag).toMatch(/^union-agent-p3:[0-9a-f]{16}$/u);
    expect(agentImageTag(3, 'FROM union-agent\n', 'sha256:a')).toBe(tag);
    expect(agentImageTag(3, 'FROM union-agent\nRUN true\n', 'sha256:a')).not.toBe(tag);
    expect(agentImageTag(3, 'FROM union-agent\n', 'sha256:b')).not.toBe(tag);
  });
});
