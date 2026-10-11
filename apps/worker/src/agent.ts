import type { ContainerRuntime } from '@union/core';

export type AgentRun = {
  container: string;
  cwd: string;
  model: string;
  prompt: string;
  tools: readonly string[];
  /** Extra denied tools on top of `BASE_DENIED`. */
  denied?: readonly string[];
  resumeSessionId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
};

export type AgentOutcome =
  | { kind: 'ok'; text: string; sessionId: string; costUsd: number | null }
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
  total_cost_usd?: number;
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
  run: Pick<AgentRun, 'model' | 'tools' | 'denied' | 'resumeSessionId'>,
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
  if (run.resumeSessionId) {
    args.push('--resume', run.resumeSessionId);
  }
  return args;
}

function toOutcome(result: ResultEvent): AgentOutcome {
  if (!result.is_error) {
    return {
      kind: 'ok',
      text: result.result.trim(),
      sessionId: result.session_id,
      costUsd: result.total_cost_usd ?? null,
    };
  }
  return RATE_LIMIT.test(result.result)
    ? { kind: 'rate_limited', message: result.result }
    : { kind: 'error', message: result.result };
}

/** Runs `claude -p` inside the ticket's container and streams its events to `onEvent`. */
export async function runAgent(runtime: ContainerRuntime, run: AgentRun): Promise<AgentOutcome> {
  const stream = runtime.exec(run.container, claudeArgs(run), {
    cwd: run.cwd,
    stdin: run.prompt,
    signal: run.signal,
  });
  const results: ResultEvent[] = [];
  let next = await stream.next();
  while (!next.done) {
    const event = parseLine(next.value);
    if (event !== undefined) {
      run.onEvent(event);
      if (isResultEvent(event)) {
        results.push(event);
      }
    }
    next = await stream.next();
  }
  const result = results.at(-1);
  if (result) {
    return toOutcome(result);
  }
  const { exitCode, stderr } = next.value;
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
