// Stops a `claude` process that ended its turn, with no background task left, but does not exit.
import type { ContainerRuntime } from '@union/core';

import { runIn } from './container-exec';

/** Quiet time after the final result before the agent counts as idle. */
export const IDLE_GRACE_MS = 30_000;
/** Time SIGTERM gets before SIGKILL. */
const KILL_AFTER_MS = 10_000;
/** Set in the agent's environment, so its processes (and theirs) can be found and stopped. */
export const RUN_MARKER = 'UNION_AGENT_RUN';
/** `$1`: the signal; `$2`: `<marker>=<token>`. Only builtins and `tr`: the image has no `ps`. */
const KILL_SCRIPT = `for e in /proc/[0-9]*/environ; do
  env=" $(tr '\\0' ' ' < "$e" 2>/dev/null) "
  case "$env" in *" $2 "*) p=\${e#/proc/}; kill -s "$1" "\${p%/environ}" 2>/dev/null;; esac
done; true`;

type Fields = { type?: unknown; subtype?: unknown; taskId?: unknown };

function fieldsOf(event: unknown): Fields {
  if (typeof event !== 'object' || event === null) {
    return {};
  }
  return {
    type: 'type' in event ? event.type : undefined,
    subtype: 'subtype' in event ? event.subtype : undefined,
    taskId: 'task_id' in event ? event.task_id : undefined,
  };
}

/** What the stream says so far: whether the last event ended the turn, and the tasks still open. */
export type IdleTracker = { observe: (event: unknown) => void; idle: () => boolean };

export function idleTracker(): IdleTracker {
  const open = new Set<string>();
  let ended = false;
  return {
    observe(event: unknown): void {
      const { type, subtype, taskId } = fieldsOf(event);
      ended = type === 'result';
      if (type === 'system' && typeof taskId === 'string') {
        if (subtype === 'task_started') {
          open.add(taskId);
        } else if (subtype === 'task_notification') {
          open.delete(taskId);
        }
      }
    },
    idle: (): boolean => ended && open.size === 0,
  };
}

export type IdleWatch = { observe: (event: unknown) => void; stop: () => void };

type WatchOptions = {
  container: string;
  /** The value of `RUN_MARKER` in the agent's environment. */
  token: string;
  graceMs: number;
  onEvent: (event: unknown) => void;
};

async function signalAgent(
  runtime: ContainerRuntime,
  { container, token, onEvent }: WatchOptions,
  signal: 'TERM' | 'KILL',
): Promise<void> {
  const command = ['sh', '-c', KILL_SCRIPT, 'sh', signal, `${RUN_MARKER}=${token}`];
  const result = await runIn(runtime, container, command).catch((error: unknown) => ({
    exitCode: 1,
    stderr: String(error),
  }));
  if (result.exitCode !== 0) {
    onEvent({ type: 'union_agent_stop_failed', signal, error: result.stderr.trim() });
  }
}

/**
 * Watches the agent's events; once the turn ended with nothing left in the background and nothing
 * came for `graceMs`, stops the agent's processes so its exec ends and the last result is used.
 */
export function watchIdle(runtime: ContainerRuntime, options: WatchOptions): IdleWatch {
  const tracker = idleTracker();
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const clear = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  const stopAgent = (): void => {
    options.onEvent({ type: 'union_agent_idle_stopped', idleMs: options.graceMs });
    void signalAgent(runtime, options, 'TERM');
    timer = setTimeout(() => {
      void signalAgent(runtime, options, 'KILL');
    }, KILL_AFTER_MS);
  };
  return {
    observe(event: unknown): void {
      tracker.observe(event);
      clear();
      if (tracker.idle()) {
        timer = setTimeout(stopAgent, options.graceMs);
      }
    },
    stop: clear,
  };
}
