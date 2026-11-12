import { describe, expect, test } from 'bun:test';

import {
  AgentImageError,
  agentImageTag,
  buildableDockerfile,
  dockerfileBases,
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

  test('takes earlier stages from other images, the last one from a base', () => {
    const dockerfile =
      'FROM rust:1-slim-bookworm AS rust\nFROM union-agent-base\nCOPY --from=rust /a /a\n';
    expect(parseAgentImageSource({ kind: 'dockerfile', dockerfile }).kind).toBe('dockerfile');
    expect(() =>
      parseAgentImageSource({
        kind: 'dockerfile',
        dockerfile: 'FROM union-agent AS a\nFROM debian\n',
      }),
    ).toThrow(AgentImageError);
  });

  test('takes the minimal base', () => {
    const source = parseAgentImageSource({
      kind: 'dockerfile',
      dockerfile: 'FROM union-agent-base\n',
    });
    expect(source.kind).toBe('dockerfile');
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
  const images = {
    'union-agent': 'union-agent:local',
    'union-agent-base': 'union-agent-base:local',
  };

  test('starts every base stage from the image the worker has', () => {
    const built = buildableDockerfile(
      '# syntax=docker/dockerfile:1\nFROM union-agent AS tools\nRUN true\nFROM union-agent\nCOPY --from=tools /a /a\n',
      images,
    );
    expect(built).toBe(
      '# syntax=docker/dockerfile:1\nFROM union-agent:local AS tools\nRUN true\nFROM union-agent:local\nCOPY --from=tools /a /a\n',
    );
  });

  test('reads the minimal base too, and leaves other images alone', () => {
    const text = 'FROM union-agent-base\nFROM rust:1 AS build\nFROM Union-Agent-Base\n';
    expect(buildableDockerfile(text, images)).toBe(
      'FROM union-agent-base:local\nFROM rust:1 AS build\nFROM union-agent-base:local\n',
    );
    expect(dockerfileBases(text)).toEqual(['union-agent-base']);
    expect(dockerfileBases('FROM union-agent-base AS a\nFROM union-agent\n')).toEqual([
      'union-agent-base',
      'union-agent',
    ]);
  });
});

describe('agentImageTag', () => {
  test('changes with the Dockerfile and with the base images', () => {
    const tag = agentImageTag(3, 'FROM union-agent\n', ['sha256:a']);
    expect(tag).toMatch(/^union-agent-p3:[0-9a-f]{16}$/u);
    expect(agentImageTag(3, 'FROM union-agent\n', ['sha256:a'])).toBe(tag);
    expect(agentImageTag(3, 'FROM union-agent\nRUN true\n', ['sha256:a'])).not.toBe(tag);
    expect(agentImageTag(3, 'FROM union-agent\n', ['sha256:b'])).not.toBe(tag);
  });
});
