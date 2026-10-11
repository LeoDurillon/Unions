import { expect, test } from 'bun:test';

import type { ContainerRuntime, ExecResult } from '@union/core';

import { ensureBranch } from './workspace-git';

/** Answers `git rev-parse --verify` from `refs`; records every command. */
function fakeRepo(refs: string[]): { runtime: ContainerRuntime; commands: string[][] } {
  const commands: string[][] = [];
  const runtime = {
    async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
      commands.push(command);
      const ref = command.at(-1) ?? '';
      const missing = command.includes('rev-parse') && !refs.includes(ref);
      await Promise.resolve();
      yield* [];
      return { exitCode: missing ? 1 : 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
  return { runtime, commands };
}

const checkout = (commands: string[][]): string[] | undefined =>
  commands.find((command) => command.includes('checkout'))?.slice(3);

test('an existing local branch is checked out as is', async () => {
  const { runtime, commands } = fakeRepo(['refs/heads/12-search']);
  await ensureBranch(runtime, 'c', '12-search', 'main');
  expect(checkout(commands)).toEqual(['checkout', '12-search']);
});

test('a recreated container continues from the pushed branch, keeping its commits', async () => {
  const { runtime, commands } = fakeRepo(['refs/remotes/origin/12-search']);
  await ensureBranch(runtime, 'c', '12-search', 'main');
  expect(checkout(commands)).toEqual(['checkout', '-b', '12-search', 'origin/12-search']);
});

test('a first run creates the branch from the base branch', async () => {
  const { runtime, commands } = fakeRepo([]);
  await ensureBranch(runtime, 'c', '12-search', 'main');
  expect(checkout(commands)).toEqual(['checkout', '-b', '12-search', 'main']);
});
