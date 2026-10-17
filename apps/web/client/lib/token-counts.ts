// A call's tokens as the Log shows them, from its `result` event: input with its cached share, output with its thinking.
import { parseResult, type ModelTokens } from '@union/core/agent-usage';

/** One call's main-model tokens and turns, as its result reports them. */
export type CallTokens = Pick<
  ModelTokens,
  'input' | 'cacheRead' | 'cacheWrite' | 'output' | 'thinking'
> & { turns: number };

const KEYS = ['input', 'cacheRead', 'cacheWrite', 'output', 'thinking', 'turns'] as const;
const THOUSAND = 1000;
const HUNDRED_THOUSAND = 100_000;
const MILLION = 1_000_000;
const PERCENT = 100;

export function callTokensOf(payload: unknown): CallTokens | null {
  const result = parseResult(payload);
  if (!result) {
    return null;
  }
  const { input, cacheRead, cacheWrite, output, thinking } = result.call;
  return { input, cacheRead, cacheWrite, output, thinking, turns: result.turns ?? 0 };
}

export function sumTokens(calls: CallTokens[]): CallTokens {
  const total: CallTokens = {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    thinking: 0,
    turns: 0,
  };
  for (const call of calls) {
    for (const key of KEYS) {
      total[key] += call[key];
    }
  }
  return total;
}

/** 950, 5.7k, 308k, 4.1M. */
export function count(value: number): string {
  if (value >= MILLION) {
    return `${(value / MILLION).toFixed(1)}M`;
  }
  if (value >= HUNDRED_THOUSAND) {
    return `${Math.round(value / THOUSAND)}k`;
  }
  return value >= THOUSAND ? `${(value / THOUSAND).toFixed(1)}k` : `${value}`;
}

/** `10 turns · 4.1M in (99% cached) · 5.7k out (1.2k thinking)`; empty when the call used nothing. */
export function tokensText(tokens: CallTokens): string {
  const input = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  if (input === 0 && tokens.output === 0) {
    return '';
  }
  const cached = input === 0 ? 0 : Math.round((tokens.cacheRead / input) * PERCENT);
  const thinking = tokens.thinking > 0 ? ` (${count(tokens.thinking)} thinking)` : '';
  const turns = `${tokens.turns} turn${tokens.turns === 1 ? '' : 's'}`;
  return `${turns} · ${count(input)} in (${cached}% cached) · ${count(tokens.output)} out${thinking}`;
}
