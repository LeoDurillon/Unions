// Condenses one raw `claude -p` stream-json event into zero or more log lines. A tool call keeps its id and
// input, its result its id and text, so the Log can pair them and open both.
import {
  contentBlocks,
  fromAssistantBlock,
  isRecord,
  type ActivityLine,
} from '@union/core/agent-activity';

import { callTokensOf, tokensText, type CallTokens } from './token-counts';

/** A tool call's id and what the Log can open of it: its full input, or its result. */
export type ToolCallPart = { id: string; input?: string; output?: string; failed?: boolean };

export type LogLine = {
  kind: ActivityLine['kind'] | 'init' | 'tool_result' | 'result' | 'error';
  text: string;
  /** On a call's result: what it used, for its run's total. */
  tokens?: CallTokens;
  /** On a tool call and on its result: which call, and its input or output. */
  call?: ToolCallPart;
  /** On a session's start: the model it runs on. */
  model?: string;
};

/** A result past this is cut: the Log opens it, it is not a file viewer. */
const MAX_OUTPUT = 20_000;
const JSON_INDENT = 2;

const MS_PER_SECOND = 1000;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function cut(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (cut)` : text;
}

/** A tool result's content as text: a string, or its text parts (an image says so). */
function resultText(content: unknown): string {
  if (typeof content === 'string') {
    return cut(content);
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const parts = content.map((part: unknown) => {
    if (!isRecord(part)) {
      return '';
    }
    return part.type === 'text' ? asText(part.text) : `[${asText(part.type)}]`;
  });
  return cut(parts.join('\n'));
}

function fromUserBlock(block: Record<string, unknown>): LogLine | null {
  if (block.type !== 'tool_result') {
    return null;
  }
  const failed = block.is_error === true;
  const line: LogLine = {
    kind: failed ? 'error' : 'tool_result',
    text: failed ? 'tool failed' : 'tool result',
  };
  return typeof block.tool_use_id === 'string'
    ? { ...line, call: { id: block.tool_use_id, output: resultText(block.content), failed } }
    : line;
}

/** A tool call keeps its id and its whole input, for the row that opens to them. */
function fromAssistant(block: Record<string, unknown>): LogLine | null {
  const line = fromAssistantBlock(block);
  if (line?.kind !== 'tool' || typeof block.id !== 'string') {
    return line;
  }
  return {
    ...line,
    call: { id: block.id, input: cut(JSON.stringify(block.input ?? {}, null, JSON_INDENT)) },
  };
}

function fromResult(event: Record<string, unknown>): LogLine {
  const seconds =
    typeof event.duration_ms === 'number'
      ? ` in ${Math.round(event.duration_ms / MS_PER_SECOND)}s`
      : '';
  const failed = event.is_error === true;
  const tokens = callTokensOf(event);
  const used = tokens ? tokensText(tokens) : '';
  const line: LogLine = {
    kind: failed ? 'error' : 'result',
    text: failed
      ? `failed${seconds}: ${asText(event.result)}`
      : `finished${seconds}${used ? ` · ${used}` : ''}`,
  };
  return tokens ? { ...line, tokens } : line;
}

/** Condenses one raw `claude -p` stream-json event into zero or more log lines. */
export function summarizeAgentEvent(payload: unknown): LogLine[] {
  if (!isRecord(payload)) {
    return [];
  }
  switch (payload.type) {
    case 'system': {
      if (payload.subtype !== 'init') {
        return [];
      }
      return typeof payload.model === 'string'
        ? [{ kind: 'init', text: `session started · ${payload.model}`, model: payload.model }]
        : [{ kind: 'init', text: 'session started' }];
    }
    case 'assistant': {
      return contentBlocks(payload)
        .map((block) => fromAssistant(block))
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
    // A line the worker writes itself, such as which way a rebase went.
    case 'union_note': {
      return typeof payload.text === 'string' ? [{ kind: 'init', text: payload.text }] : [];
    }
    default: {
      return [];
    }
  }
}
