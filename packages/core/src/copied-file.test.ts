// Tests of the check on files copied out of containers: only regular files, within a size, reach the host.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkCopiedFile, CopyRefused } from './copied-file';

let dir: string;

/** The error the check throws, or null when the file passes. */
async function refusal(hostPath: string, maxBytes?: number): Promise<unknown> {
  try {
    await checkCopiedFile(hostPath, maxBytes);
    return null;
  } catch (error) {
    return error;
  }
}

async function gone(hostPath: string): Promise<boolean> {
  return (await lstat(hostPath).catch(() => null)) === null;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'union-copied-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('a regular file within the size passes', async () => {
  const file = path.join(dir, 'a.png');
  await writeFile(file, 'png');
  expect(await refusal(file, 3)).toBeNull();
  expect(await refusal(file)).toBeNull();
  expect(await gone(file)).toBe(false);
});

test('a symlink is refused and removed, and its target is left alone', async () => {
  const target = path.join(dir, 'secret');
  await writeFile(target, 'key');
  const link = path.join(dir, 'a.png');
  await symlink(target, link);
  expect(await refusal(link)).toBeInstanceOf(CopyRefused);
  expect(await gone(link)).toBe(true);
  expect(await Bun.file(target).text()).toBe('key');
});

test('a folder and a file over the size are refused and removed', async () => {
  const folder = path.join(dir, 'a.png');
  await mkdir(path.join(folder, 'inner'), { recursive: true });
  expect(await refusal(folder)).toMatchObject({ reason: 'is not a regular file' });
  expect(await gone(folder)).toBe(true);
  const big = path.join(dir, 'big.png');
  await writeFile(big, 'four');
  expect(await refusal(big, 3)).toMatchObject({ reason: 'is larger than 3 bytes' });
  expect(await gone(big)).toBe(true);
});
