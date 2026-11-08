// The report's lists read from the agent's block: requirements with their quotes checked against the
// specs sent, the important files, the risks and the docs.
import {
  IMPORTANT_FILE_KINDS,
  quoteKey,
  REPORT_LEVELS,
  REQUIREMENT_STATUSES,
  type ImportantFile,
  type ReportDoc,
  type ReportRequirement,
  type ReportRisk,
  type ReportSpec,
} from '@union/core';

import { keyOf } from './review-grouping-result';
import {
  keep,
  oneOf,
  pathOf,
  rangeOf,
  records,
  text,
  texts,
  type Parsed,
} from './review-report-fields';
import { MAX_IMPORTANT_FILES, MAX_UNCHANGED_FILES } from './review-report-format';

/** The requirements, and their keys by what the agent called them (its key or its title). */
export type Requirements = Parsed<ReportRequirement> & { keys: Map<string, string> };

/**
 * The spec a quote is found in (markdown marks and quote signs aside), the one the agent named first;
 * `lost` when it is in none.
 */
function quoteOf(
  item: Record<string, unknown>,
  specs: ReportSpec[],
): { spec: string | null; specId: number | null; lost: boolean } {
  const quote = text(item.spec);
  const named = specs.find((spec) => spec.id === item.specId) ?? null;
  if (quote === '') {
    return { spec: null, specId: named?.id ?? null, lost: false };
  }
  const found = [...(named ? [named] : []), ...specs].find((spec) =>
    quoteKey(spec.text).includes(quoteKey(quote)),
  );
  return found
    ? { spec: quote, specId: found.id, lost: false }
    : { spec: null, specId: named?.id ?? null, lost: true };
}

export function evidenceOf(value: unknown): Parsed<ReportRequirement['evidence'][number]> {
  return keep(records(value), (item) => {
    const path = pathOf(item.path);
    const range = rangeOf(item.start, item.end);
    return path !== null && range !== null ? { path, ...range } : null;
  });
}

function pathsOf(value: unknown): Parsed<string> {
  const raw = texts(value);
  const items = raw.flatMap((path) => pathOf(path) ?? []);
  return { items, dropped: raw.length - items.length };
}

/** One requirement, and how many of its quote, code and tests could not be kept. */
function requirementOf(
  item: Record<string, unknown>,
  specs: ReportSpec[],
  key: string,
): { requirement: ReportRequirement; dropped: number } {
  const { lost, ...quote } = quoteOf(item, specs);
  const evidence = evidenceOf(item.evidence);
  const tests = pathsOf(item.tests);
  const requirement: ReportRequirement = {
    key,
    title: text(item.title),
    ...quote,
    status: oneOf(REQUIREMENT_STATUSES, item.status) ?? 'unclear',
    evidence: evidence.items,
    tests: tests.items,
    note: text(item.note),
  };
  return { requirement, dropped: (lost ? 1 : 0) + evidence.dropped + tests.dropped };
}

/** The requirements with a title, each with a unique key; the agent's names for them map to it. */
export function requirementsOf(value: unknown, specs: ReportSpec[]): Requirements {
  const raw = records(value);
  const titled = raw.filter((item) => text(item.title) !== '');
  const taken = new Set<string>();
  const keys = new Map<string, string>();
  const items: ReportRequirement[] = [];
  let dropped = raw.length - titled.length;
  for (const item of titled) {
    const title = text(item.title);
    const named = text(item.key) || title;
    const key = keyOf(named, taken);
    keys.set(named, key).set(title, key);
    const read = requirementOf(item, specs, key);
    items.push(read.requirement);
    dropped += read.dropped;
  }
  return { items, dropped, keys };
}

function importantFileOf(
  item: Record<string, unknown>,
  path: string,
  changed: ReadonlySet<string>,
  keys: Map<string, string>,
): ImportantFile {
  const requirements = texts(item.requirements).flatMap((name) => keys.get(name) ?? []);
  return {
    path,
    why: text(item.why),
    kind: oneOf(IMPORTANT_FILE_KINDS, item.kind) ?? 'core',
    lines: records(item.lines).flatMap((line) => rangeOf(line.start, line.end) ?? []),
    requirements: [...new Set(requirements)],
    unchanged: !changed.has(path),
  };
}

/**
 * The files to read first, in the agent's order: each once, at most `MAX_IMPORTANT_FILES`, of which
 * at most `MAX_UNCHANGED_FILES` are outside the change.
 */
export function importantFilesOf(
  value: unknown,
  changed: ReadonlySet<string>,
  keys: Map<string, string>,
): Parsed<ImportantFile> {
  const raw = records(value);
  const items: ImportantFile[] = [];
  for (const item of raw) {
    const path = pathOf(item.path);
    const unchanged = items.filter((file) => file.unchanged).length;
    const full = path !== null && !changed.has(path) && unchanged >= MAX_UNCHANGED_FILES;
    if (path !== null && !full && !items.some((file) => file.path === path)) {
      items.push(importantFileOf(item, path, changed, keys));
    }
  }
  const kept = items.slice(0, MAX_IMPORTANT_FILES);
  return { items: kept, dropped: raw.length - kept.length };
}

export function risksOf(value: unknown): Parsed<ReportRisk> {
  return keep(records(value), (item) => {
    const title = text(item.title);
    if (title === '') {
      return null;
    }
    const severity = oneOf(REPORT_LEVELS, item.severity) ?? 'medium';
    return { title, detail: text(item.detail), paths: pathsOf(item.paths).items, severity };
  });
}

export function docsOf(value: unknown): Parsed<ReportDoc> {
  return keep(records(value), (item) => {
    const path = pathOf(item.path);
    return path === null ? null : { path, note: text(item.note) };
  });
}
