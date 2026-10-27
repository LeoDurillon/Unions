// Finds the answer block at the end of an agent's text: the last fenced `json` block of the expected shape.

const JSON_BLOCK = /```json[^\n]*\n(?<json>[\s\S]*?)\n\s*```/gu;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The last fenced `json` block that parses to an object `accept` takes; null when there is none. */
export function lastJsonBlock(
  answer: string,
  accept: (block: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  for (const block of [...answer.matchAll(JSON_BLOCK)].toReversed()) {
    try {
      const parsed: unknown = JSON.parse(block.groups?.json ?? '');
      if (isRecord(parsed) && accept(parsed)) {
        return parsed;
      }
    } catch {
      // Not this block: an earlier one may be the answer.
    }
  }
  return null;
}
