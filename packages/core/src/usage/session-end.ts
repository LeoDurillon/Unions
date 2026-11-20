// The context a session holds when a call ends: its last turn's, or what a compaction after it left.

import { parseTurn } from './agent-usage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A `compact_boundary` event: the session's context after the CLI compacted it (by hand or on its own). */
function parseCompaction(payload: unknown): { sessionId: string; after: number } | null {
  if (
    !isRecord(payload) ||
    payload.type !== 'system' ||
    payload.subtype !== 'compact_boundary' ||
    typeof payload.session_id !== 'string'
  ) {
    return null;
  }
  const metadata = payload.compact_metadata;
  const after = isRecord(metadata) ? metadata.post_tokens : undefined;
  return typeof after === 'number' ? { sessionId: payload.session_id, after } : null;
}

/**
 * The context the next resume starts from, from the call's lines in order: the last turn's (of the
 * call's own thread), or a compaction's when one came after it; null when neither says.
 */
export function endContext(payloads: readonly unknown[]): number | null {
  for (const payload of payloads.toReversed()) {
    const compaction = parseCompaction(payload);
    if (compaction) {
      return compaction.after;
    }
    const turn = parseTurn(payload);
    if (turn) {
      return turn.context;
    }
  }
  return null;
}
