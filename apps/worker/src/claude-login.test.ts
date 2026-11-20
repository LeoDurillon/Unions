import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AGENT_HOME, type ContainerRuntime } from '@union/core';

import { claudeSettings, refusedLoginNote, seedCredentials, withClaudeLogin } from './claude-login';

const TOKEN = `sk-ant-oat01-${'t'.repeat(40)}`;

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type Seen = { written: Map<string, string> };

function fakeRuntime(seen: Seen): ContainerRuntime {
  return {
    writeFile: (_container: string, file: string, content: string) => {
      seen.written.set(file, content);
      return Promise.resolve();
    },
  } as unknown as ContainerRuntime;
}

async function credentialsFile(content: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'union-login-test-'));
  cleanup.push(root);
  const file = path.join(root, 'credentials.json');
  await writeFile(file, JSON.stringify(content));
  return file;
}

test('without a token, only claudeAiOauth is copied and a token left from before is emptied', async () => {
  const seen: Seen = { written: new Map() };
  const credentialsPath = await credentialsFile({
    claudeAiOauth: { accessToken: 'a', refreshToken: 'r' },
    mcpOAuth: { figma: 'secret' },
  });
  await seedCredentials(fakeRuntime(seen), 'c', { credentialsPath, claudeToken: () => null });
  expect(JSON.parse(seen.written.get(`${AGENT_HOME}/.claude/.credentials.json`) ?? '')).toEqual({
    claudeAiOauth: { accessToken: 'a', refreshToken: 'r' },
  });
  expect(seen.written.get(`${AGENT_HOME}/.claude/oauth-token`)).toBe('');
});

test('with a token, the login is not copied, and one copied before is emptied', async () => {
  const seen: Seen = { written: new Map() };
  const credentialsPath = await credentialsFile({ claudeAiOauth: { refreshToken: 'r' } });
  await seedCredentials(fakeRuntime(seen), 'c', { credentialsPath, claudeToken: () => TOKEN });
  expect(seen.written.get(`${AGENT_HOME}/.claude/oauth-token`)).toBe(TOKEN);
  expect(seen.written.get(`${AGENT_HOME}/.claude/.credentials.json`)).toBe('{}');
  expect([...seen.written.values()].join('\n')).not.toContain('"r"');
});

test('with a token, no host login is needed', async () => {
  const seen: Seen = { written: new Map() };
  await seedCredentials(fakeRuntime(seen), 'c', {
    credentialsPath: '/nowhere/credentials.json',
    claudeToken: () => TOKEN,
  });
  expect(seen.written.get(`${AGENT_HOME}/.claude/oauth-token`)).toBe(TOKEN);
});

test('without a Claude login, seeding says to log in and writes nothing', async () => {
  const seen: Seen = { written: new Map() };
  async function failure(credentialsPath: string): Promise<string> {
    try {
      await seedCredentials(fakeRuntime(seen), 'c', { credentialsPath });
      return 'seeded';
    } catch (error) {
      return String(error);
    }
  }
  expect(await failure('/nowhere/credentials.json')).toContain('Claude is not logged in');
  expect(await failure(await credentialsFile({ mcpOAuth: {} }))).toContain(
    'Claude is not logged in',
  );
  expect(seen.written.size).toBe(0);
});

test('the CLI settings carry the auto-compact window when one is set, and are emptied when not', async () => {
  const seen: Seen = { written: new Map() };
  const settingsFile = `${AGENT_HOME}/.claude/settings.json`;
  const source = { credentialsPath: '/nowhere', claudeToken: () => TOKEN };
  await seedCredentials(fakeRuntime(seen), 'c', { ...source, autoCompactWindow: () => 200_000 });
  expect(JSON.parse(seen.written.get(settingsFile) ?? '')).toEqual({ autoCompactWindow: 200_000 });
  await seedCredentials(fakeRuntime(seen), 'c', { ...source, autoCompactWindow: () => null });
  expect(seen.written.get(settingsFile)).toBe('{}');
  expect(claudeSettings(null)).toBe('{}');
});

test('the wrapped command reads the token inside the container, never from its arguments', () => {
  const command = withClaudeLogin(['claude', '-p', '--model', 'opus']);
  expect(command.slice(0, 2)).toEqual(['sh', '-c']);
  expect(command.slice(-4)).toEqual(['claude', '-p', '--model', 'opus']);
  expect(command.join(' ')).not.toContain('sk-ant');
  expect(command[2]).toContain('CLAUDE_CODE_OAUTH_TOKEN');
});

test('the wrapper runs the command with the token from the file, or without it', async () => {
  const script = withClaudeLogin(['sh', '-c', 'echo "[$CLAUDE_CODE_OAUTH_TOKEN]"'])[2] ?? '';
  const root = await mkdtemp(path.join(tmpdir(), 'union-wrap-test-'));
  cleanup.push(root);
  const tokenFile = `${AGENT_HOME}/.claude/oauth-token`;
  const local = script.replaceAll(tokenFile, path.join(root, 'oauth-token'));
  const run = async (): Promise<string> => {
    const proc = Bun.spawn(
      ['sh', '-c', local, 'claude-login', 'sh', '-c', 'echo "[$CLAUDE_CODE_OAUTH_TOKEN]"'],
      {
        stdout: 'pipe',
        env: { PATH: process.env.PATH ?? '' },
      },
    );
    return (await new Response(proc.stdout).text()).trim();
  };
  expect(await run()).toBe('[]');
  await writeFile(path.join(root, 'oauth-token'), '');
  expect(await run()).toBe('[]');
  await writeFile(path.join(root, 'oauth-token'), TOKEN);
  expect(await run()).toBe(`[${TOKEN}]`);
});

test('a refused login says which login and how to renew it; other failures say nothing more', () => {
  expect(refusedLoginNote('API Error: 401 {"type":"authentication_error"}')).toContain(
    'claude setup-token',
  );
  expect(refusedLoginNote('OAuth token has expired')).toContain('Claude login');
  expect(refusedLoginNote('Something else broke')).toBe('');
});
