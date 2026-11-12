// Condenses one raw `claude -p` stream-json event into zero or more log lines.
import {
  contentBlocks,
  fromAssistantBlock,
  isRecord,
  type ActivityLine,
} from '@union/core/agent-activity';

import { callTokensOf, tokensText, type CallTokens } from './token-counts';

export type LogLine = {
  kind: ActivityLine['kind'] | 'init' | 'tool_result' | 'result' | 'error';
  text: string;
  /** On a call's result: what it used, for its run's total. */
  tokens?: CallTokens;
};

const MS_PER_SECOND = 1000;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
    // A line the worker writes itself, such as which way a rebase went.
    case 'union_note': {
      return typeof payload.text === 'string' ? [{ kind: 'init', text: payload.text }] : [];
    }
    default: {
      return [];
    }
  }
}
