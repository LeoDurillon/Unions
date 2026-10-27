// Reads the fields of the report agent's block: texts, lists, enums, paths and line ranges, never trusted.
import type { ReportLines } from '@union/core';

import { isRecord } from './json-block';

const MAX_TEXT = 4000;
const MAX_ITEMS = 40;

/** Items read from the agent's block, and how many it gave that could not be kept. */
export type Parsed<T> = { items: T[]; dropped: number };

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

/** The objects of a list, at most `MAX_ITEMS`. */
export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS).filter((item) => isRecord(item)) : [];
}

/** The non-empty texts of a list, at most `MAX_ITEMS`. */
export function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .slice(0, MAX_ITEMS)
        .map((item) => text(item))
        .filter((item) => item !== '')
    : [];
}

export function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

/** A path inside the checkout: relative, without `..`; null otherwise. */
export function pathOf(value: unknown): string | null {
  const path = text(value).replace(/^\.\//u, '');
  if (path === '' || path.startsWith('/') || path.split('/').includes('..')) {
    return null;
  }
  return path;
}

function lineOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** Lines `start` to `end` (in either order); a missing end is the start. */
export function rangeOf(start: unknown, end: unknown): ReportLines | null {
  const from = lineOf(start);
  const to = lineOf(end) ?? from;
  if (from === null || to === null) {
    return null;
  }
  return { start: Math.min(from, to), end: Math.max(from, to) };
}

/** Every item `parse` keeps, counting the others as dropped. */
export function keep<T>(
  raw: Record<string, unknown>[],
  parse: (item: Record<string, unknown>) => T | null,
): Parsed<T> {
  const items = raw.flatMap((item) => parse(item) ?? []);
  return { items, dropped: raw.length - items.length };
}
