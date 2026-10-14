import { PREVIEW_REPO_DIR, type ContainerRuntime } from '@union/core';

/** The Docker CLI image (with the compose plugin) the helper containers run. */
const COMPOSE_IMAGE = 'docker:29.0.0-cli';
const SOCKET = '/var/run/docker.sock';
const DEFAULT_PROXY_PORT = 8080;
const DEFAULT_MAX_PREVIEWS = 3;
const HTTP_PORT = 80;
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

/** The address a person opens: `http://12.localhost`, with the port unless it is 80. */
export function previewUrl(host: string, settings: PreviewSettings): string {
  return settings.publicPort === HTTP_PORT
    ? `http://${host}`
    : `http://${host}:${settings.publicPort}`;
}

export type ComposeRun = { exitCode: number; tail: string[] };

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
  });
  const tail: string[] = [];
  for (;;) {
    const next = await lines.next();
    if (next.done) {
      return { exitCode: next.value.exitCode, tail };
    }
    tail.push(next.value);
    if (tail.length > TAIL_LINES) {
      tail.shift();
    }
    run.onLine?.(next.value);
  }
}
