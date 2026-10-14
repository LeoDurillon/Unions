import {
  hunkAt,
  hunksOf,
  type GroupingResult,
  type Hunk,
  type SpecGroup,
  type UnrelatedChange,
} from '@union/core';

const JSON_BLOCK = /```json[^\n]*\n(?<json>[\s\S]*?)\n\s*```/gu;
const MAX_GROUPS = 40;
const MAX_TEXT = 2000;
const NOT_PLACED = 'Not placed by the agent';
/** A file without hunks (binary, a rename alone) is placed whole, under this key. */
const WHOLE = '*';

/** A changed file and the keys of its hunks, in the diff's order. */
type Change = { path: string; hunks: Hunk[]; keys: string[] };
/** Some changes: by path, the keys of the hunks taken. */
type Placement = Map<string, Set<string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The last JSON block holding `groups`, as the agent wrote it; null when there is none. */
function lastBlock(answer: string): Record<string, unknown> | null {
  const blocks = [...answer.matchAll(JSON_BLOCK)].toReversed();
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block.groups?.json ?? '');
      if (isRecord(parsed) && Array.isArray(parsed.groups)) {
        return parsed;
      }
    } catch {
      // Not this block: an earlier one may be the answer.
    }
  }
  return null;
}

/** `Automatic unpublishing` → `automatic-unpublishing`, unique among the keys already taken. */
function keyOf(title: string, taken: Set<string>): string {
  const base =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '') || 'part';
  let key = base;
  for (let count = 2; taken.has(key); count += 1) {
    key = `${base}-${count}`;
  }
  taken.add(key);
  return key;
}

/** The hunks the cited lines fall in; no line, or a file without hunks: the whole file. */
function cited(change: Change, lines: unknown): string[] {
  const numbers = list(lines).filter((line): line is number => typeof line === 'number');
  if (numbers.length === 0 || change.hunks.length === 0) {
    return change.keys;
  }
  return numbers.flatMap((line) => hunkAt(change.hunks, line)?.key ?? []);
}

function take(placement: Placement, path: string, keys: string[]): void {
  const taken = placement.get(path) ?? new Set<string>();
  for (const key of keys) {
    taken.add(key);
  }
  if (taken.size > 0) {
    placement.set(path, taken);
  }
}

/** What a group names: its whole files, then its hunks by line. Unknown paths are dropped. */
function placementOf(item: Record<string, unknown>, changes: Map<string, Change>): Placement {
  const placement: Placement = new Map();
  for (const path of list(item.files).map((entry) => text(entry))) {
    const change = changes.get(path);
    if (change) {
      take(placement, path, change.keys);
    }
  }
  for (const entry of list(item.hunks).filter((value) => isRecord(value))) {
    const change = changes.get(text(entry.path));
    if (change) {
      take(placement, change.path, cited(change, entry.lines));
    }
  }
  return placement;
}

/** A group's files in the diff's order, and the hunks of those it covers only in part. */
function groupOf(
  base: Omit<SpecGroup, 'files' | 'hunks'>,
  placement: Placement,
  changes: Map<string, Change>,
): SpecGroup {
  const files: string[] = [];
  const hunks: Record<string, string[]> = {};
  for (const change of changes.values()) {
    const taken = placement.get(change.path);
    if (taken) {
      files.push(change.path);
      if (taken.size < change.keys.length) {
        hunks[change.path] = change.keys.filter((key) => taken.has(key));
      }
    }
  }
  return Object.keys(hunks).length > 0 ? { ...base, files, hunks } : { ...base, files };
}

function groupsOf(
  raw: unknown[],
  changes: Map<string, Change>,
): { groups: SpecGroup[]; placed: Placement; empty: { spec: string; note: string }[] } {
  const taken = new Set<string>();
  const groups: SpecGroup[] = [];
  const placed: Placement = new Map();
  const empty: { spec: string; note: string }[] = [];
  for (const item of raw.slice(0, MAX_GROUPS).filter((entry) => isRecord(entry))) {
    const title = text(item.title);
    const spec = text(item.spec);
    const placement = placementOf(item, changes);
    if (title !== '' && placement.size === 0) {
      empty.push({ spec: spec || title, note: 'No change placed under it' });
    } else if (title !== '') {
      const base = { key: keyOf(title, taken), title, spec, summary: text(item.summary) };
      groups.push(groupOf(base, placement, changes));
      for (const [path, keys] of placement) {
        take(placed, path, [...keys]);
      }
    }
  }
  return { groups, placed, empty };
}

/** An unrelated change, whole when it is all of the file. */
function unrelatedChange(change: Change, reason: string, keys: string[]): UnrelatedChange {
  return keys.length === change.keys.length
    ? { path: change.path, reason }
    : { path: change.path, reason, hunks: keys };
}

/**
 * The changes no group took: the ones the agent called unrelated, with its reason, then every
 * hunk it placed nowhere.
 */
function unrelatedOf(
  raw: unknown[],
  changes: Map<string, Change>,
  placed: Placement,
): UnrelatedChange[] {
  const result: UnrelatedChange[] = [];
  const listed: Placement = new Map();
  for (const item of raw.filter((entry) => isRecord(entry))) {
    const change = changes.get(text(item.path));
    const free = change
      ? cited(change, item.lines).filter(
          (key) => !placed.get(change.path)?.has(key) && !listed.get(change.path)?.has(key),
        )
      : [];
    if (change && free.length > 0) {
      take(listed, change.path, free);
      result.push(unrelatedChange(change, text(item.reason), free));
    }
  }
  for (const change of changes.values()) {
    const left = change.keys.filter(
      (key) => !placed.get(change.path)?.has(key) && !listed.get(change.path)?.has(key),
    );
    if (left.length > 0) {
      result.push(unrelatedChange(change, NOT_PLACED, left));
    }
  }
  return result;
}

/**
 * The agent's grouping, checked against the change: only changed files and their real hunks, every
 * hunk at least once (the ones it left out are unrelated), no empty group (its part goes to
 * `missing`). Null when the answer has no grouping block.
 */
export function parseGrouping(
  answer: string,
  files: { path: string; patch: string }[],
): GroupingResult | null {
  const block = lastBlock(answer);
  if (!block) {
    return null;
  }
  const changes = new Map(
    files.map(({ path, patch }) => {
      const hunks = hunksOf(patch);
      const keys = hunks.length === 0 ? [WHOLE] : hunks.map((hunk) => hunk.key);
      return [path, { path, hunks, keys }];
    }),
  );
  const { groups, placed, empty } = groupsOf(list(block.groups), changes);
  const missing = list(block.missing)
    .filter((item) => isRecord(item))
    .map((item) => ({ spec: text(item.spec), note: text(item.note) }))
    .filter((item) => item.spec !== '');
  return {
    groups,
    unrelated: unrelatedOf(list(block.unrelated), changes, placed),
    missing: [...missing, ...empty],
  };
}
