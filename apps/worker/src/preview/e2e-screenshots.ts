// Collects an e2e run's failure screenshots from the container: regular PNG files only, a few, small.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CopyRefused, type ContainerRuntime } from '@union/core';

import { runIn } from '../container-exec';
import { REPO_DIR } from '../provision';

/** Failure screenshots kept: enough to see what broke, few enough to read. */
const MAX_SCREENSHOTS = 5;
/** `find -size` counts in 1 KiB blocks: 5 MiB. */
const MAX_SCREENSHOT_KIB = 5120;
const KIB = 1024;
const PNG_SIGNATURE = Buffer.from('89504E470D0A1A0A', 'hex');

export type Screenshot = { name: string; bytes: Uint8Array };

/** What was kept, and a line for each file that was not (the run's output shows them). */
export type Screenshots = { kept: Screenshot[]; skipped: string[] };

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.equals(bytes.subarray(0, PNG_SIGNATURE.length));
}

function listScreenshots(runtime: ContainerRuntime, container: string): Promise<string[]> {
  return runIn(
    runtime,
    container,
    [
      'sh',
      '-c',
      `find test-results -type f -name '*.png' -size -${MAX_SCREENSHOT_KIB}k 2>/dev/null | head -${MAX_SCREENSHOTS}`,
    ],
    { cwd: REPO_DIR },
  ).then((listed) => listed.stdout.split('\n').filter((line) => line.trim() !== ''));
}

/** One screenshot's bytes, or why it is skipped: the copy is refused (not a plain file, too large) or is no PNG. */
async function copyScreenshot(
  runtime: ContainerRuntime,
  container: string,
  file: string,
  local: string,
): Promise<Uint8Array | string> {
  try {
    await runtime.copyOut(container, `${REPO_DIR}/${file}`, local, MAX_SCREENSHOT_KIB * KIB);
  } catch (error) {
    if (error instanceof CopyRefused) {
      return `the copy ${error.reason}`;
    }
    throw error;
  }
  const bytes = await readFile(local);
  return isPng(bytes) ? bytes : 'not a PNG image';
}

/**
 * The newest failure screenshots of the run (Playwright writes them under `test-results`). The
 * listing runs in the container, so a listed file can still be a symlink by the time it is copied:
 * the copy checks it again on the host.
 */
export async function collectScreenshots(
  runtime: ContainerRuntime,
  container: string,
): Promise<Screenshots> {
  const files = await listScreenshots(runtime, container);
  const result: Screenshots = { kept: [], skipped: [] };
  if (files.length === 0) {
    return result;
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'union-e2e-'));
  try {
    for (const [index, file] of files.entries()) {
      const copied = await copyScreenshot(runtime, container, file, path.join(dir, `${index}.png`));
      if (typeof copied === 'string') {
        result.skipped.push(`Union skipped the screenshot ${file}: ${copied}`);
      } else {
        // `test-results/<test folder>/test-failed-1.png`: the folder names the test.
        result.kept.push({ name: `${path.basename(path.dirname(file))}.png`, bytes: copied });
      }
    }
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
