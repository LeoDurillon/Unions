// Counts an agent call's tool uses from its stream-json lines: calls, errors, refusals and output size per tool key.
import { toolKey, type ToolKey } from './agent-tool-key';

/** One tool key's figures in a call; `subagent` when a subagent made the calls. */
export type ToolCount = ToolKey & {
  subagent: boolean;
  calls: number;
  errors: number;
  denied: number;
  resultBytes: number;
};

type Block = Record<string, unknown>;

function isRecord(value: unknown): value is Block {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function blocksOf(payload: Block): Block[] {
  const { message } = payload;
  const content = isRecord(message) ? message.content : undefined;
  return Array.isArray(content) ? content.filter((block): block is Block => isRecord(block)) : [];
}

/** The size of a tool result's text; an image counts nothing (its tokens do not follow its bytes). */
function resultSize(content: unknown): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  return content
    .filter((block): block is Block => isRecord(block))
    .reduce((sum, block) => sum + (typeof block.text === 'string' ? block.text.length : 0), 0);
}

class Counter {
  private readonly byKey = new Map<string, ToolCount>();
  private readonly byUse = new Map<string, ToolCount>();

  use(id: string, key: ToolKey, subagent: boolean): void {
    const name = JSON.stringify([key.tool, key.target, key.variant, subagent]);
    const count = this.byKey.get(name) ?? {
      ...key,
      subagent,
      calls: 0,
      errors: 0,
      denied: 0,
      resultBytes: 0,
    };
    count.calls += 1;
    this.byKey.set(name, count);
    this.byUse.set(id, count);
  }

  result(block: Block): void {
    const count = typeof block.tool_use_id === 'string' && this.byUse.get(block.tool_use_id);
    if (count) {
      count.resultBytes += resultSize(block.content);
      count.errors += block.is_error === true ? 1 : 0;
    }
  }

  denied(id: unknown): void {
    const count = typeof id === 'string' && this.byUse.get(id);
    if (count) {
      count.denied += 1;
    }
  }

  counts(): ToolCount[] {
    return [...this.byKey.values()];
  }
}

function readLine(counter: Counter, payload: Block): void {
  if (payload.type === 'system' && payload.subtype === 'permission_denied') {
    counter.denied(payload.tool_use_id);
    return;
  }
  const subagent = typeof payload.parent_tool_use_id === 'string';
  for (const block of blocksOf(payload)) {
    if (payload.type === 'assistant' && block.type === 'tool_use' && typeof block.id === 'string') {
      counter.use(block.id, toolKey(String(block.name), block.input), subagent);
    } else if (payload.type === 'user' && block.type === 'tool_result') {
      counter.result(block);
    }
  }
}

/**
 * The tool uses of one call, from its lines in order: `assistant` lines give the uses, `user` lines
 * their results and `system` `permission_denied` lines the refusals.
 */
export function countToolCalls(payloads: unknown[]): ToolCount[] {
  const counter = new Counter();
  for (const payload of payloads) {
    if (isRecord(payload)) {
      readLine(counter, payload);
    }
  }
  return counter.counts();
}
