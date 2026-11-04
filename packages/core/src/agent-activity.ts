// What an agent says or does in one `claude -p` stream-json event, in a short line: shared by the
// Log (in the browser) and the board's live progress (read on the server). Browser-safe.

/** A short line for one block of an assistant message: what it wrote, or the tool it called. */
export type ActivityLine = { kind: 'text' | 'tool'; text: string };

const MAX_TEXT = 600;
const MAX_ARG = 140;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** The content blocks of a message event (`assistant` or `user`). */
export function contentBlocks(event: Record<string, unknown>): Record<string, unknown>[] {
  const { message } = event;
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return [];
  }
  return message.content.filter(isRecord);
}

/** A tool call's first text argument (the file, the command, the pattern), clipped. */
function toolArgument(input: unknown): string {
  if (!isRecord(input)) {
    return '';
  }
  const first = Object.values(input).find((value) => typeof value === 'string');
  return typeof first === 'string' ? clip(first, MAX_ARG) : '';
}

/** What an assistant block shows: its text, or the tool it calls with its first argument; null for the rest (thinking). */
export function fromAssistantBlock(block: Record<string, unknown>): ActivityLine | null {
  if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
    return { kind: 'text', text: clip(block.text, MAX_TEXT) };
  }
  if (block.type === 'tool_use' && typeof block.name === 'string') {
    return { kind: 'tool', text: `${block.name} ${toolArgument(block.input)}`.trim() };
  }
  return null;
}

/** The last thing an assistant event shows (its last tool call or text), or null for any other event. */
export function latestActivity(payload: unknown): ActivityLine | null {
  if (!isRecord(payload) || payload.type !== 'assistant') {
    return null;
  }
  const lines = contentBlocks(payload)
    .map((block) => fromAssistantBlock(block))
    .filter((line) => line !== null);
  return lines.at(-1) ?? null;
}
