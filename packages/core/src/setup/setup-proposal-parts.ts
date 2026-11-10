// Readers for the setup agent's answer block: texts, lists and names, each refusal noted instead of thrown.
import { isRecord } from '../agent-activity';

const MAX_TEXT = 4000;
const MAX_ITEMS = 30;

/** The refusals met while reading, for the proposal's `dropped`. */
export type Dropped = string[];

export function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS).filter((item) => isRecord(item)) : [];
}

export function section(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && !Array.isArray(value) ? value : null;
}

export function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** The strings of a list matching `pattern`; the others noted under `what`. */
export function names(value: unknown, pattern: RegExp, what: string, dropped: Dropped): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MAX_ITEMS).flatMap((item: unknown) => {
    const name = text(item);
    if (pattern.test(name)) {
      return [name];
    }
    dropped.push(`${what} "${name}": not a valid name`);
    return [];
  });
}

/** The non-empty strings of a list. */
export function lines(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_ITEMS)
    .map((item: unknown) => text(item))
    .filter((line) => line !== '');
}
