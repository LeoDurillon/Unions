// Reads what a `claude -p` call consumed from its stream-json events: tokens per model, and its peak context.

export type ModelTokens = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** Part of `output`. */
  thinking: number;
  webSearches: number;
  /** API-equivalent; null when the event does not say. */
  costUsd: number | null;
  contextWindow: number | null;
};

/** A `result` event: the session's figures so far per model, and the call's own main-model `usage`. */
export type CallResult = {
  sessionId: string;
  failed: boolean;
  turns: number | null;
  durationMs: number | null;
  apiDurationMs: number | null;
  /** Cumulative over the session: a resumed session adds to the previous call's figures. */
  models: Record<string, ModelTokens>;
  /** This call only, main model only. */
  call: ModelTokens;
};

/** One API turn of the call's own thread (not a subagent's). */
export type Turn = { sessionId: string; messageId: string; model: string; context: number };

export type CallUsage = { model: string; main: boolean; tokens: ModelTokens };

const SYNTHETIC = '<synthetic>';

const TOKEN_FIELDS = [
  'input',
  'cacheRead',
  'cacheWrite',
  'output',
  'thinking',
  'webSearches',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function count(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

function maybe(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

/** The result's `usage` (snake case, this call, main model). */
function fromUsage(usage: Record<string, unknown>): ModelTokens {
  return {
    input: count(usage, 'input_tokens'),
    cacheRead: count(usage, 'cache_read_input_tokens'),
    cacheWrite: count(usage, 'cache_creation_input_tokens'),
    output: count(usage, 'output_tokens'),
    thinking: count(field(usage, 'output_tokens_details'), 'thinking_tokens'),
    webSearches: count(field(usage, 'server_tool_use'), 'web_search_requests'),
    costUsd: null,
    contextWindow: null,
  };
}

/** One model of the result's `modelUsage` (camel case, cumulative). */
function fromModelUsage(usage: Record<string, unknown>): ModelTokens {
  return {
    input: count(usage, 'inputTokens'),
    cacheRead: count(usage, 'cacheReadInputTokens'),
    cacheWrite: count(usage, 'cacheCreationInputTokens'),
    output: count(usage, 'outputTokens'),
    thinking: count(usage, 'thinkingTokens'),
    webSearches: count(usage, 'webSearchRequests'),
    costUsd: maybe(usage, 'costUSD'),
    contextWindow: maybe(usage, 'contextWindow'),
  };
}

export function parseResult(payload: unknown): CallResult | null {
  if (!isRecord(payload) || payload.type !== 'result' || typeof payload.session_id !== 'string') {
    return null;
  }
  const models = Object.entries(field(payload, 'modelUsage')).flatMap(([model, usage]) =>
    isRecord(usage) ? [[model, fromModelUsage(usage)] as const] : [],
  );
  return {
    sessionId: payload.session_id,
    failed: payload.is_error === true,
    turns: maybe(payload, 'num_turns'),
    durationMs: maybe(payload, 'duration_ms'),
    apiDurationMs: maybe(payload, 'duration_api_ms'),
    models: Object.fromEntries(models),
    call: fromUsage(field(payload, 'usage')),
  };
}

/** An `assistant` event of the call's own thread; a subagent's (`parent_tool_use_id`) is null. */
export function parseTurn(payload: unknown): Turn | null {
  if (
    !isRecord(payload) ||
    payload.type !== 'assistant' ||
    typeof payload.session_id !== 'string'
  ) {
    return null;
  }
  if (typeof payload.parent_tool_use_id === 'string') {
    return null;
  }
  const message = field(payload, 'message');
  // The CLI writes its own messages (a usage limit, an API error) as `<synthetic>` turns.
  if (
    typeof message.id !== 'string' ||
    typeof message.model !== 'string' ||
    message.model === SYNTHETIC
  ) {
    return null;
  }
  const usage = field(message, 'usage');
  const context =
    count(usage, 'input_tokens') +
    count(usage, 'cache_read_input_tokens') +
    count(usage, 'cache_creation_input_tokens');
  return { sessionId: payload.session_id, messageId: message.id, model: message.model, context };
}

/** The call's largest context, and the model its turns ran on (each message counted once). */
export function peakOf(turns: Turn[]): { peak: number | null; model: string | null } {
  const seen = new Map<string, Turn>();
  for (const turn of turns) {
    seen.set(turn.messageId, turn);
  }
  const unique = [...seen.values()];
  const peak = unique.length === 0 ? null : Math.max(...unique.map((turn) => turn.context));
  return { peak, model: unique.at(-1)?.model ?? null };
}

function minus(current: ModelTokens, previous: ModelTokens | undefined): ModelTokens | null {
  if (!previous) {
    return current;
  }
  const delta = { ...current };
  for (const key of TOKEN_FIELDS) {
    delta[key] = current[key] - previous[key];
  }
  delta.costUsd =
    current.costUsd === null || previous.costUsd === null
      ? null
      : current.costUsd - previous.costUsd;
  const negative = TOKEN_FIELDS.some((key) => delta[key] < 0) || (delta.costUsd ?? 0) < 0;
  return negative ? null : delta;
}

function isEmpty(tokens: ModelTokens): boolean {
  return TOKEN_FIELDS.every((key) => tokens[key] === 0);
}

/** The model with the most output in the call, when its turns do not say. */
function busiest(usages: CallUsage[]): string | null {
  const sorted = usages.toSorted((a, b) => b.tokens.output - a.tokens.output);
  return sorted[0]?.model ?? null;
}

/**
 * The call's share per model: its result's cumulative figures minus the session's previous
 * result's. A negative share (the CLI reset its totals) falls back to the call's own `usage` for
 * the main model, and to the cumulative figures for the others.
 */
export function callUsage(
  current: CallResult,
  previous: CallResult | null,
  mainModel: string | null,
): CallUsage[] {
  const usages = Object.entries(current.models).map(([model, tokens]): CallUsage => {
    const fallback =
      model === mainModel ? { ...current.call, contextWindow: tokens.contextWindow } : tokens;
    return { model, main: false, tokens: minus(tokens, previous?.models[model]) ?? fallback };
  });
  const main = mainModel ?? busiest(usages);
  // A call that failed before its first turn still gets its row, empty.
  if (main !== null && !usages.some((usage) => usage.model === main)) {
    usages.push({ model: main, main: false, tokens: current.call });
  }
  const kept = usages.filter((usage) => usage.model === main || !isEmpty(usage.tokens));
  for (const usage of kept) {
    usage.main = usage.model === main;
  }
  return kept;
}
