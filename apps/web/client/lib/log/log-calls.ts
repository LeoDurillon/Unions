// Pairs each tool result with its call in a Log: the call's row gets the output, the result's own line goes.

import type { ToolCallPart } from './agent-events';

type CallLine = { kind: string; call?: ToolCallPart };

/** A result line that belongs to a call shown earlier. */
function resultOf<T extends CallLine>(entry: T, calls: Map<string, T>): T | undefined {
  if (entry.kind === 'tool' || entry.call?.output === undefined) {
    return undefined;
  }
  return calls.get(entry.call.id);
}

/**
 * The lines with each call's result folded into the call (its output, whether it failed); a result whose
 * call is not in the lines stays as it is.
 */
export function pairCalls<T extends CallLine>(entries: readonly T[]): T[] {
  const calls = new Map<string, T>();
  const paired: T[] = [];
  for (const entry of entries) {
    const call = resultOf(entry, calls);
    if (call?.call) {
      const index = paired.indexOf(call);
      const merged = {
        ...call,
        call: { ...call.call, output: entry.call?.output, failed: entry.call?.failed === true },
      };
      paired[index] = merged;
      calls.set(call.call.id, merged);
    } else {
      paired.push(entry);
      if (entry.kind === 'tool' && entry.call) {
        calls.set(entry.call.id, entry);
      }
    }
  }
  return paired;
}
