import { PREVIEW_REPO_DIR, type ContainerRuntime } from '@union/core';

/** The Docker CLI image (with the compose plugin) the helper containers run. */
const COMPOSE_IMAGE = 'docker:29.0.0-cli';
const SOCKET = '/var/run/docker.sock';
const DEFAULT_PROXY_PORT = 8080;
const DEFAULT_MAX_PREVIEWS = 3;
/** Lines of output kept for the panel and the failure reason. */
export const TAIL_LINES = 200;

export type PreviewSettings = {
  image: string;
  /** Port the proxy listens on, for the address shown to the user. */
  publicPort: number;
  /** How the worker reaches the proxy, for the ready check. */
  proxyUrl: string;
  maxRunning: number;
};

export function previewSettings(
  env: Record<string, string | undefined> = process.env,
): PreviewSettings {
  const publicPort = Number(env.UNION_PREVIEW_PORT ?? DEFAULT_PROXY_PORT);
  return {
    image: env.UNION_COMPOSE_IMAGE ?? COMPOSE_IMAGE,
    publicPort,
    proxyUrl: env.UNION_PREVIEW_PROXY ?? `http://localhost:${publicPort}`,
    maxRunning: Number(env.UNION_MAX_PREVIEWS ?? DEFAULT_MAX_PREVIEWS),
  };
}

/** `tail`: the last lines, for logs and reasons; `lines`: all of them, when asked (`keepAll`). */
export type ComposeRun = { exitCode: number; tail: string[]; lines: string[] };

const JSON_START = /^\s*[{[]/u;

/**
 * The JSON a command printed (`config --format json`), from its first `{`: compose prints its
 * warnings on the same stream, before it. Null when there is none, or it does not parse.
 */
export function printedJson(lines: string[]): unknown {
  const start = lines.findIndex((line) => JSON_START.test(line));
  if (start === -1) {
    return null;
  }
  try {
    return JSON.parse(lines.slice(start).join('\n'));
  } catch {
    return null;
  }
}

/**
 * `docker compose <args>` in a helper container holding the Docker socket, and the ticket's workspace
 * when given (at `/workspace`, the repository in `/workspace/repo`). The agent's container never
 * holds the socket. Output lines go to `onLine` as they come.
 */
export async function compose(
  runtime: ContainerRuntime,
  settings: PreviewSettings,
  run: {
    args: string[];
    workspaceVolume?: string;
    stdin?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
    onLine?: (line: string) => void;
    /** Keep every line: a resolved compose file is hundreds of lines long. */
    keepAll?: boolean;
    /** Written in the helper first: Union's env file, which the file to run reads. */
    files?: { path: string; content: string }[];
  },
): Promise<ComposeRun> {
  const mounts = [
    { source: SOCKET, target: SOCKET },
    ...(run.workspaceVolume ? [{ source: run.workspaceVolume, target: '/workspace' }] : []),
  ];
  const lines = runtime.runHelper({
    image: settings.image,
    command: ['docker', 'compose', '--ansi', 'never', ...run.args],
    mounts,
    cwd: run.workspaceVolume ? PREVIEW_REPO_DIR : undefined,
    env: run.env,
    stdin: run.stdin,
    signal: run.signal,
    files: run.files,
  });
  const tail: string[] = [];
  const all: string[] = [];
  for (;;) {
    const next = await lines.next();
    if (next.done) {
      return { exitCode: next.value.exitCode, tail, lines: all };
    }
    if (run.keepAll === true) {
      all.push(next.value);
    }
    tail.push(next.value);
    if (tail.length > TAIL_LINES) {
      tail.shift();
    }
    run.onLine?.(next.value);
  }
}

/** The agent's user in its image (`node`): what owns the workspace. */
const AGENT_UID = '1000:1000';
const CREATE_MISSING = `for dir; do [ -e "$dir" ] || { mkdir -p "$dir" && chown ${AGENT_UID} "$dir"; }; done`;

/**
 * Creates the workspace folders a file mounts that do not exist yet (a cache folder such as
 * `.npm`), as compose does for a missing bind-mount source: Docker refuses a missing volume
 * sub-path. They go to the agent's user, so the agent can still write there.
 */
export async function createMountFolders(
  runtime: ContainerRuntime,
  settings: PreviewSettings,
  workspaceVolume: string,
  subpaths: string[],
): Promise<void> {
  if (subpaths.length === 0) {
    return;
  }
  const lines = runtime.runHelper({
    image: settings.image,
    command: [
      'sh',
      '-c',
      CREATE_MISSING,
      'sh',
      ...subpaths.map((subpath) => `/workspace/${subpath}`),
    ],
    mounts: [{ source: workspaceVolume, target: '/workspace' }],
  });
  const output: string[] = [];
  for (;;) {
    const next = await lines.next();
    if (next.done) {
      if (next.value.exitCode !== 0) {
        throw new Error(
          `Could not create the folders the compose file mounts:\n${output.join('\n')}`,
        );
      }
      return;
    }
    output.push(next.value);
  }
}
