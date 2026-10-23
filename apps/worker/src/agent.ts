// Runs `claude -p` inside the ticket's container and streams its events to `onEvent`.
import {
  connectorHints,
  isConnectorTool,
  type AgentEffort,
  type ContainerRuntime,
  type ExecResult,
} from '@union/core';

import { IDLE_GRACE_MS, RUN_MARKER, watchIdle } from './agent-idle';

export type AgentRun = {
  container: string;
  cwd: string;
  model: string;
  /** Thinking effort (`--effort`); null or absent: the CLI's default. */
  effort?: AgentEffort | null;
  prompt: string;
  tools: readonly string[];
  /** Extra denied tools on top of `BASE_DENIED`. */
  denied?: readonly string[];
  resumeSessionId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
  /** Quiet time after the final result before the process is stopped; `IDLE_GRACE_MS` by default. */
  idleGraceMs?: number;
};

export type AgentOutcome =
  | { kind: 'ok'; text: string; sessionId: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'error'; message: string };

const RATE_LIMIT = /usage limit|rate limit|limit reached|too many requests/iu;
/** Always denied: the host owns the remote; the container has no credentials anyway. */
export const BASE_DENIED = [
  'Bash(git push*)',
  'Bash(git remote*)',
  'Bash(gh *)',
  'Bash(curl *)',
] as const;

type ResultEvent = {
  type: 'result';
  result: string;
  session_id: string;
  is_error: boolean;
};

function isResultEvent(value: unknown): value is ResultEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'result' &&
    'result' in value &&
    typeof value.result === 'string' &&
    'session_id' in value &&
    typeof value.session_id === 'string' &&
    'is_error' in value &&
    typeof value.is_error === 'boolean'
  );
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

export function claudeArgs(
  run: Pick<AgentRun, 'model' | 'effort' | 'tools' | 'denied' | 'resumeSessionId'>,
): string[] {
  const args = [
    'claude',
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    run.model,
    '--allowedTools',
    run.tools.join(','),
    '--disallowedTools',
    [...BASE_DENIED, ...(run.denied ?? [])].join(','),
  ];
  if (run.effort) {
    args.push('--effort', run.effort);
  }
  if (run.resumeSessionId) {
    args.push('--resume', run.resumeSessionId);
  }
  const hints = connectorHints(run.tools);
  if (hints !== null) {
    args.push('--append-system-prompt', hints);
  }
  return args;
}

/**
 * The account's claude.ai connectors reach every container through the Claude login: a run loads
 * them only when its tools include one, otherwise they would fill its context with tools it is
 * refused.
 */
export function connectorEnv(tools: readonly string[]): Record<string, string> {
  return {
    ENABLE_CLAUDEAI_MCP_SERVERS: tools.some((tool) => isConnectorTool(tool)) ? 'true' : 'false',
  };
}

function toOutcome(result: ResultEvent): AgentOutcome {
  if (!result.is_error) {
    return {
      kind: 'ok',
      text: result.result.trim(),
      sessionId: result.session_id,
    };
  }
  return RATE_LIMIT.test(result.result)
    ? { kind: 'rate_limited', message: result.result }
    : { kind: 'error', message: result.result };
}

/** Reads the agent's events to the end: its last result, and how the process exited. */
async function readEvents(
  stream: AsyncGenerator<string, ExecResult>,
  onEvent: (event: unknown) => void,
): Promise<{ result: ResultEvent | undefined; exit: ExecResult }> {
  let result: ResultEvent | undefined = undefined;
  let next = await stream.next();
  while (!next.done) {
    const event = parseLine(next.value);
    if (event !== undefined) {
      onEvent(event);
      if (isResultEvent(event)) {
        result = event;
      }
    }
    next = await stream.next();
  }
  return { result, exit: next.value };
}

/** Runs `claude -p` inside the ticket's container and streams its events to `onEvent`. */
export async function runAgent(runtime: ContainerRuntime, run: AgentRun): Promise<AgentOutcome> {
  const token = crypto.randomUUID();
  const stream = runtime.exec(run.container, claudeArgs(run), {
    cwd: run.cwd,
    stdin: run.prompt,
    env: { ...connectorEnv(run.tools), [RUN_MARKER]: token },
    signal: run.signal,
  });
  // The CLI sometimes stays up after its last result: the turn is over, so it is stopped.
  const idle = watchIdle(runtime, {
    container: run.container,
    token,
    graceMs: run.idleGraceMs ?? IDLE_GRACE_MS,
    onEvent: run.onEvent,
  });
  const { result, exit } = await readEvents(stream, (event) => {
    run.onEvent(event);
    idle.observe(event);
  }).finally(() => {
    idle.stop();
  });
  if (result) {
    return toOutcome(result);
  }
  const { exitCode, stderr } = exit;
  const message = `claude exited with ${exitCode} and no result: ${stderr.trim()}`;
  return RATE_LIMIT.test(stderr) ? { kind: 'rate_limited', message } : { kind: 'error', message };
}

export type AgentFn = (runtime: ContainerRuntime, run: AgentRun) => Promise<AgentOutcome>;

const MISSING_SESSION = /No conversation found with session ID/u;

/**
 * Resumes `run.resumeSessionId`; if the session is gone (its HOME volume was rebuilt), runs again in
 * a fresh session with `freshPrompt`, which must carry the whole context the session had.
 */
export async function runResumable(
  agent: AgentFn,
  runtime: ContainerRuntime,
  run: AgentRun,
  freshPrompt: string,
): Promise<AgentOutcome> {
  const outcome = await agent(runtime, run);
  if (outcome.kind !== 'error' || !run.resumeSessionId || !MISSING_SESSION.test(outcome.message)) {
    return outcome;
  }
  run.onEvent({ type: 'union_session_lost', sessionId: run.resumeSessionId });
  return agent(runtime, { ...run, resumeSessionId: null, prompt: freshPrompt });
}
