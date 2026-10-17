// The specifications an agent review is given: read from the request, and written into the agent's prompt. Pure.
import { SPEC_SOURCES, type SpecSource } from './schema-review-groupings';

/** A specification as the user sent it; in a stack, `prs` are the pull requests that implement it. */
export type AgentReviewSpec = { kind: SpecSource; label: string; text: string; prs: number[] };

export const MAX_SPECS = 10;
export const MAX_SPEC_CHARS = 50_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is SpecSource {
  return SPEC_SOURCES.some((source) => source === value);
}

function prsOf(value: unknown): number[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((n) => Number.isInteger(n) && Number(n) > 0)) {
    return null;
  }
  return [...new Set(value.map(Number))];
}

/** One spec, or why it is refused. */
function specOf(value: unknown, position: number): AgentReviewSpec | string {
  const name = `Spec ${position}`;
  if (!isRecord(value) || !isSource(value.kind)) {
    return `${name}: "kind" must be one of ${SPEC_SOURCES.join(', ')}`;
  }
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const prs = prsOf(value.prs);
  if (label === '' || text === '') {
    return `${name}: a label and a text are needed`;
  }
  if (text.length > MAX_SPEC_CHARS) {
    return `${name} is longer than ${MAX_SPEC_CHARS} characters: keep the part that matters`;
  }
  if (prs === null) {
    return `${name}: "prs" must be pull request numbers`;
  }
  return { kind: value.kind, label, text, prs };
}

/** The specs of a request, or why they are refused. */
export function parseAgentReviewSpecs(
  value: unknown,
): { specs: AgentReviewSpec[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: '"specs" must be a list' };
  }
  if (value.length > MAX_SPECS) {
    return { error: `At most ${MAX_SPECS} specs` };
  }
  const specs: AgentReviewSpec[] = [];
  for (const [index, item] of value.entries()) {
    const spec = specOf(item, index + 1);
    if (typeof spec === 'string') {
      return { error: spec };
    }
    specs.push(spec);
  }
  return { specs };
}

/** The prompt's section on the specs; empty when there are none (the agent reviews the code alone). */
export function specsSection(specs: AgentReviewSpec[]): string {
  if (specs.length === 0) {
    return '';
  }
  const parts = specs.map((spec, index) => {
    const covers =
      spec.prs.length > 0 ? ` (implemented by ${spec.prs.map((n) => `#${n}`).join(', ')})` : '';
    return `### Spec ${index + 1}: ${spec.label}${covers}\n\n${spec.text}`;
  });
  return `## Specifications

The change is meant to implement these. Check that it does what they ask, and comment on what is missing, done differently, or done without being asked.

${parts.join('\n\n')}`;
}
