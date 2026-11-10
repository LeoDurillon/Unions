// The caps of a container on the docker command line: its memory (no swap beyond it), the CPU cores it may use, and how many processes it runs.

/** Processes a container may run at once: room for builds and test runners, not for a runaway fork. */
const PIDS_LIMIT = 4096;

/** What a container may use: its memory in MB, and its CPU cores as a cpuset (`3-8`). */
export type ContainerLimits = { memoryMb: number; cpuset: string };

const HASH_BASE = 31;
const HASH_MOD = 1_000_003;

function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) {
    hash = (hash * HASH_BASE + (char.codePointAt(0) ?? 0)) % HASH_MOD;
  }
  return hash;
}

/**
 * The cores a container may use: `count` consecutive ones, starting where its name puts it, so two
 * runs at once tend to get different cores; all of them when `count` is the machine's or more. Tools
 * that ask how many cores they have (`nproc`, Node's `availableParallelism`) then size their workers to it.
 */
export function cpusetFor(name: string, count: number, hostCores: number): string {
  const cores = Math.max(1, Math.min(count, hostCores));
  const start = hashOf(name) % (hostCores - cores + 1);
  return `${start}-${start + cores - 1}`;
}

/** The caps of a container: `--memory` and `--memory-swap` equal (no swap), its cores, and the process limit. */
export function limitArgs(limits?: ContainerLimits): string[] {
  return limits === undefined
    ? []
    : [
        '--memory',
        `${limits.memoryMb}m`,
        '--memory-swap',
        `${limits.memoryMb}m`,
        '--cpuset-cpus',
        limits.cpuset,
        '--pids-limit',
        String(PIDS_LIMIT),
      ];
}
