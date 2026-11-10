// Runs `claude -p` inside the ticket's container and streams its events to `onEvent`.
import {
  BASE_DENIED,
  connectorHints,
  isConnectorTool,
  type AgentEffort,
  type ContainerRuntime,
  type ExecResult,
} from '@union/core';

import { killedNote } from '../container-exec';
import { IDLE_GRACE_MS, RUN_MARKER, stopAborted, watchIdle } from './agent-idle';
import { RATE_LIMIT, rejectedResetAt, resetFromMessage } from './rate-limit';

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
  /** `resetsAt`: when the limit resets, in ms, when the CLI said so. */
  | { kind: 'rate_limited'; message: string; resetsAt: number | null }
  | { kind: 'error'; message: string };

/** Always denied: the host owns the remote; the container has no credentials anyway. */
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

/**
 * A failed call is a usage limit when the CLI reported its limit rejected, or its message says so.
 * The reset comes from the report, else from the message ("resets 6:20pm (UTC)").
 */
function failure(message: string, rejectedReset: number | null): AgentOutcome {
  if (rejectedReset === null && !RATE_LIMIT.test(message)) {
    return { kind: 'error', message };
  }
  return {
    kind: 'rate_limited',
    message,
    resetsAt: rejectedReset ?? resetFromMessage(message, Date.now()),
  };
}

function toOutcome(result: ResultEvent, rejectedReset: number | null): AgentOutcome {
  if (!result.is_error) {
    return {
      kind: 'ok',
      text: result.result.trim(),
      sessionId: result.session_id,
    };
  }
  return failure(result.result, rejectedReset);
}

type Read = {
  result: ResultEvent | undefined;
  /** When the limit resets, from the last `rate_limit_event` that reported it rejected. */
  rejectedReset: number | null;
  exit: ExecResult;
};

/** Reads the agent's events to the end: its last result, a rejected limit, and how the process exited. */
async function readEvents(
  stream: AsyncGenerator<string, ExecResult>,
  onEvent: (event: unknown) => void,
): Promise<Read> {
  let result: ResultEvent | undefined = undefined;
  let rejectedReset: number | null = null;
  let next = await stream.next();
  while (!next.done) {
    const event = parseLine(next.value);
    if (event !== undefined) {
      onEvent(event);
      if (isResultEvent(event)) {
        result = event;
      }
      rejectedReset = rejectedResetAt(event) ?? rejectedReset;
    }
    next = await stream.next();
  }
  return { result, rejectedReset, exit: next.value };
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
  const { result, rejectedReset, exit } = await readEvents(stream, (event) => {
    run.onEvent(event);
    idle.observe(event);
  }).finally(() => {
    idle.stop();
  });
  if (run.signal?.aborted) {
    await stopAborted(runtime, { container: run.container, token, onEvent: run.onEvent });
  }
  if (result) {
    return toOutcome(result, rejectedReset);
  }
  const { exitCode, stderr } = exit;
  return failure(
    `claude exited with ${exitCode} and no result: ${stderr.trim()}${killedNote(exitCode)}`,
    rejectedReset,
  );
}

export type AgentFn = (runtime: ContainerRuntime, run: AgentRun) => Promise<AgentOutcome>;

/** The error of an agent call that did not finish, a usage limit named as such. */
export function agentFailure(outcome: Exclude<AgentOutcome, { kind: 'ok' }>): string {
  return outcome.kind === 'rate_limited'
    ? `Usage limit reached: ${outcome.message}`
    : outcome.message;
}

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
