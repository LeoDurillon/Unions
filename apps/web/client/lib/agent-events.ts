export type LogLine = {
  kind: 'init' | 'text' | 'tool' | 'tool_result' | 'result' | 'error';
  text: string;
};

const MAX_TEXT = 600;
const MAX_ARG = 140;
const MS_PER_SECOND = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clip(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function contentBlocks(event: Record<string, unknown>): Record<string, unknown>[] {
  const { message } = event;
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return [];
  }
  return message.content.filter(isRecord);
}

function toolArgument(input: unknown): string {
  if (!isRecord(input)) {
    return '';
  }
  const first = Object.values(input).find((value) => typeof value === 'string');
  return typeof first === 'string' ? clip(first, MAX_ARG) : '';
}

function fromAssistantBlock(block: Record<string, unknown>): LogLine | null {
  if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
    return { kind: 'text', text: clip(block.text, MAX_TEXT) };
  }
  if (block.type === 'tool_use' && typeof block.name === 'string') {
    return { kind: 'tool', text: `${block.name} ${toolArgument(block.input)}`.trim() };
  }
  return null;
}

function fromUserBlock(block: Record<string, unknown>): LogLine | null {
  if (block.type !== 'tool_result') {
    return null;
  }
  const failed = block.is_error === true;
  return { kind: failed ? 'error' : 'tool_result', text: failed ? 'tool failed' : 'tool result' };
}

function fromResult(event: Record<string, unknown>): LogLine {
  const seconds =
    typeof event.duration_ms === 'number'
      ? ` in ${Math.round(event.duration_ms / MS_PER_SECOND)}s`
      : '';
  const failed = event.is_error === true;
  return {
    kind: failed ? 'error' : 'result',
    text: failed ? `failed${seconds}: ${asText(event.result)}` : `finished${seconds}`,
  };
}

/** Condenses one raw `claude -p` stream-json event into zero or more log lines. */
export function summarizeAgentEvent(payload: unknown): LogLine[] {
  if (!isRecord(payload)) {
    return [];
  }
  switch (payload.type) {
    case 'system': {
      return payload.subtype === 'init'
        ? [
            {
              kind: 'init',
              text: `session started${typeof payload.model === 'string' ? ` · ${payload.model}` : ''}`,
            },
          ]
        : [];
    }
    case 'assistant': {
      return contentBlocks(payload)
        .map((block) => fromAssistantBlock(block))
        .filter((line) => line !== null);
    }
    case 'user': {
      return contentBlocks(payload)
        .map((block) => fromUserBlock(block))
        .filter((line) => line !== null);
    }
    case 'result': {
      return [fromResult(payload)];
    }
    default: {
      return [];
    }
  }
}
