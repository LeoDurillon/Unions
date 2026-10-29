// The `docker run` arguments of a throwaway helper container, and its removal when its work is aborted.
import type { HelperSpec } from './runtime';

/** `docker run --rm -i` of the helper, named when it must be found again (`name`). */
export function helperArgs(spec: HelperSpec, name: string | null): string[] {
  // Each file's content travels in a variable of its own and is written by the shell: the
  // helper has no volume to hold it, and stdin may already carry the compose file.
  const files = spec.files ?? [];
  const contents = files.flatMap((file, index) => ['-e', `UNION_FILE_${index}=${file.content}`]);
  const writes = files
    .map(
      (file, index) =>
        `mkdir -p "$(dirname '${file.path}')" && printf '%s' "$UNION_FILE_${index}" > '${file.path}' && `,
    )
    .join('');
  const env = Object.entries(spec.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const mounts = (spec.mounts ?? []).flatMap((mount) => ['-v', `${mount.source}:${mount.target}`]);
  return [
    'run',
    '--rm',
    '-i',
    ...(name === null ? [] : ['--name', name]),
    ...mounts,
    ...contents,
    ...env,
    ...(spec.cwd ? ['-w', spec.cwd] : []),
    spec.image,
    // Compose reports its progress on stderr: one stream keeps the lines in order.
    'sh',
    '-c',
    `${writes}exec "$@" 2>&1`,
    'sh',
    ...spec.command,
  ];
}

/** Calls `remove` once `signal` aborts (at once when it already has); a failed removal is ignored. */
export function removeOnAbort(signal: AbortSignal, remove: () => Promise<void>): void {
  const onAbort = async (): Promise<void> => {
    try {
      await remove();
    } catch {
      // The container may be gone already.
    }
  };
  if (signal.aborted) {
    void onAbort();
    return;
  }
  signal.addEventListener(
    'abort',
    () => {
      void onAbort();
    },
    { once: true },
  );
}
