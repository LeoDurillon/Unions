// Checks a file copied out of a container before the host reads it: a regular file, within a size.
import { lstat, rm } from 'node:fs/promises';

/** A copy out of a container that is not a plain file (a symlink, a folder) or is too large. */
export class CopyRefused extends Error {
  override name = 'CopyRefused';

  /** Why, without the host path: `is not a regular file`. */
  readonly reason: string;

  constructor(hostPath: string, reason: string) {
    super(`${hostPath} ${reason}`);
    this.reason = reason;
  }
}

function sizeProblem(size: number, maxBytes: number | undefined): string | null {
  return maxBytes !== undefined && size > maxBytes ? `is larger than ${maxBytes} bytes` : null;
}

/**
 * `docker cp` keeps a symlink as a symlink, and reading it on the host follows it to a host file
 * (`a.png -> /home/bun/.ssh/id_ed25519`). Anything but a regular file is removed and refused, and
 * so is a file over `maxBytes`.
 */
export async function checkCopiedFile(hostPath: string, maxBytes?: number): Promise<void> {
  const stats = await lstat(hostPath);
  const problem = stats.isFile() ? sizeProblem(stats.size, maxBytes) : 'is not a regular file';
  if (problem !== null) {
    await rm(hostPath, { recursive: true, force: true });
    throw new CopyRefused(hostPath, problem);
  }
}
