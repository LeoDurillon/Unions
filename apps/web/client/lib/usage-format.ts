// How the Usage tables write a total: input with its cached share, output, API-equivalent cost, peak context.
import type { UsageModel, UsageTotals } from '@union/core';

import { count } from './token-counts';

type Tokens = Pick<UsageModel, 'input' | 'cacheRead' | 'cacheWrite' | 'output' | 'thinking'>;

const PERCENT = 100;
const CENT = 0.01;
/** A peak past this share of the window is close to a compaction. */
const CONTEXT_WARNING = 0.8;

/** `4.1M (99% cached)`. */
export function inputText(tokens: Tokens): string {
  const input = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  if (input === 0) {
    return '0';
  }
  return `${count(input)} (${Math.round((tokens.cacheRead / input) * PERCENT)}% cached)`;
}

/** `5.7k (1.2k thinking)`. */
export function outputText(tokens: Tokens): string {
  const thinking = tokens.thinking > 0 ? ` (${count(tokens.thinking)} thinking)` : '';
  return `${count(tokens.output)}${thinking}`;
}

/** `$1.23`, `<$0.01`, or a dash when no call reported a cost. */
export function costText(costUsd: UsageTotals['costUsd']): string {
  if (costUsd === null) {
    return '–';
  }
  if (costUsd > 0 && costUsd < CENT) {
    return '<$0.01';
  }
  return `$${costUsd.toFixed(2)}`;
}

/** `411k / 1.0M`, and whether it is close to the window. */
export function peakText(
  peak: number | null,
  window: number | null,
): { text: string; high: boolean } | null {
  if (peak === null) {
    return null;
  }
  return {
    text: window === null ? count(peak) : `${count(peak)} / ${count(window)}`,
    high: window !== null && peak > window * CONTEXT_WARNING,
  };
}
