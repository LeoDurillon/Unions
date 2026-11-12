// Tests what a tool call is counted as: command families and forms, the file read, the skill and the subagent.
import { expect, test } from 'bun:test';

import { commandTarget, commandVariant, mainCommand, toolKey } from './agent-tool-key';

test('the main command drops the cd, variables and timeout before it, and what follows it', () => {
  expect(
    mainCommand('cd /workspace/repo/goreno && FOO=1 timeout 400 pnpm install 2>&1 | tail -5'),
  ).toBe('pnpm install');
  expect(mainCommand('git status --short; git log')).toBe('git status --short');
});

test('git commands are told apart by what they print', () => {
  expect(commandTarget('git diff senova-dev...HEAD')).toBe('git diff');
  expect(commandTarget('git diff --stat main...HEAD')).toBe('git diff --stat');
  expect(commandTarget('git diff main...HEAD -- src/a.ts')).toBe('git diff -- <path>');
  expect(commandTarget('git -C /repo log --oneline')).toBe('git log');
  expect(commandTarget('git log --oneline')).toBe('git log');
});

test('a runner counts as the tool it runs', () => {
  expect(commandTarget('pnpm exec jest --selectProjects unit')).toBe('jest');
  expect(commandTarget('pnpm --filter api exec tsc --noEmit')).toBe('tsc');
  expect(commandTarget('pnpm --filter=api test')).toBe('test');
  expect(commandTarget('npx eslint src')).toBe('eslint');
  expect(commandTarget('./node_modules/.bin/jest a.spec.ts')).toBe('jest');
});

test('a form keeps the flags, not their values nor the files', () => {
  expect(
    commandVariant('pnpm exec jest --selectProjects unit --testPathPattern "a b" src/x.ts'),
  ).toBe('jest --selectProjects --testPathPattern');
  expect(commandVariant('pnpm exec eslint $F --max-warnings=0')).toBe('eslint --max-warnings');
});

test('the key of each tool', () => {
  expect(toolKey('Read', { file_path: '/workspace/repo/src/a.ts' })).toEqual({
    tool: 'Read',
    target: 'src/a.ts',
    variant: '',
  });
  expect(toolKey('Skill', { skill: 'gitmoji-commit' }).target).toBe('gitmoji-commit');
  expect(toolKey('Agent', { description: 'x' }).target).toBe('general-purpose');
  expect(toolKey('Grep', { pattern: 'x' })).toEqual({ tool: 'Grep', target: '', variant: '' });
  expect(toolKey('Bash', { command: 'git diff --stat' }).variant).toBe('git diff --stat --stat');
});
