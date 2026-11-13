// The slices of a large change an agent review reads one by one: from a grouping by spec, or by folder.
// Each hunk is owned by one slice; a slice too large is split by folder, one too small merged into
// its neighbour, and there are at most `MAX_SLICES`. Pure.

import type { Hunk } from '../diff/diff-hunks';
import type { GroupingResult } from '../schema/schema-review-groupings';

/** A changed file and its hunks. */
export type SliceSource = { path: string; hunks: Hunk[] };

/** A file of a slice: whole (`hunks` null), or only the hunks it owns, by key. */
type SliceFile = { path: string; hunks: string[] | null; lines: number };

export type ReviewSlice = {
  title: string;
  /** The part of the specification it covers, quoted; empty for a slice by folder. */
  spec: string;
  summary: string;
  files: SliceFile[];
  lines: number;
};

/** One agent's run of a sliced review, as the review page shows it; the last is the pass on the seams. */
export type SliceProgress = {
  title: string;
  files: number;
  lines: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  comments: number | null;
  error: string | null;
};

export const MAX_SLICES = 8;
/** The project's `sliceReviewAbove` when it sets none. */
export const DEFAULT_SLICE_REVIEW_ABOVE = 1200;

/** Changed lines above which a review is offered in slices; 0: never. */
export function sliceReviewAbove(config: { sliceReviewAbove?: number }): number {
  return config.sliceReviewAbove ?? DEFAULT_SLICE_REVIEW_ABOVE;
}
/** Changed lines one agent reviews well: step 1's runs stopped reading at about twice that. */
const SLICE_TARGET_LINES = 1000;
/** Above this, a slice is split by folder. */
const MAX_SLICE_LINES = 1200;
/** Below this, a slice is merged into its neighbour. */
const MIN_SLICE_LINES = 50;
const UNRELATED_TITLE = 'Changes no part of the spec asked for';

function hunkLines(hunk: Hunk): number {
  return hunk.additions + hunk.deletions;
}

function sum(files: readonly SliceFile[]): number {
  return files.reduce((total, file) => total + file.lines, 0);
}

function sliceOf(title: string, files: SliceFile[], spec = '', summary = ''): ReviewSlice {
  return { title, spec, summary, files, lines: sum(files) };
}

/** Takes the hunks `keys` of `source` not owned yet; null when none is left. */
function take(source: SliceSource, keys: readonly string[], owned: Set<string>): SliceFile | null {
  const free = source.hunks.filter(
    (hunk) => keys.includes(hunk.key) && !owned.has(`${source.path}\u0000${hunk.key}`),
  );
  const whole = source.hunks.length === 0 && !owned.has(`${source.path}\u0000*`);
  if (free.length === 0 && !whole) {
    return null;
  }
  for (const key of whole ? ['*'] : free.map((hunk) => hunk.key)) {
    owned.add(`${source.path}\u0000${key}`);
  }
  return {
    path: source.path,
    hunks: whole || free.length === source.hunks.length ? null : free.map((hunk) => hunk.key),
    lines: free.reduce((total, hunk) => total + hunkLines(hunk), 0),
  };
}

function allKeys(source: SliceSource): string[] {
  return source.hunks.map((hunk) => hunk.key);
}

/** The slices of a grouping: each group owns the hunks no earlier group took; the rest are unrelated. */
export function slicesFromGrouping(
  result: GroupingResult,
  sources: readonly SliceSource[],
): ReviewSlice[] {
  const byPath = new Map(sources.map((source) => [source.path, source]));
  const owned = new Set<string>();
  const takeFrom = (path: string, keys?: string[]): SliceFile[] => {
    const source = byPath.get(path);
    const file = source ? take(source, keys ?? allKeys(source), owned) : null;
    return file ? [file] : [];
  };
  const groups = result.groups.map((group) => {
    const split = group.hunks ?? {};
    const files = [
      ...group.files.filter((path) => !(path in split)).flatMap((path) => takeFrom(path)),
      ...Object.entries(split).flatMap(([path, keys]) => takeFrom(path, keys)),
    ];
    return sliceOf(group.title, files, group.spec, group.summary);
  });
  const rest = sources.flatMap((source) => takeFrom(source.path));
  return normalize([...groups, sliceOf(UNRELATED_TITLE, rest)]);
}

function keyAt(path: string, depth: number): string {
  return path.split('/').slice(0, depth).join('/');
}

/** Files by folder, deeper where a folder is larger than `target`; a file stays whole. */
function partition(files: SliceFile[], depth: number, target: number): SliceFile[][] {
  const groups = new Map<string, SliceFile[]>();
  for (const file of files) {
    const key = keyAt(file.path, depth);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return [...groups.values()].flatMap((group) =>
    sum(group) > target && group.length > 1 ? partition(group, depth + 1, target) : [group],
  );
}

/** The folder all `files` are in, as a slice's title; a single file is named itself. */
function commonFolder(files: readonly SliceFile[]): string {
  const [only] = files;
  if (files.length === 1 && only) {
    return only.path;
  }
  const folders = files.map((file) => file.path.split('/').slice(0, -1));
  const [first = []] = folders;
  const length = first.findIndex((part, index) => folders.some((parts) => parts[index] !== part));
  const prefix = first.slice(0, length === -1 ? first.length : length);
  return prefix.length === 0 ? 'The repository root' : `${prefix.join('/')}/`;
}

/** Folders named in a title before "and N more". */
const TITLE_FOLDERS = 3;

/** Files packed together, named by the folders they come from. */
type Pack = { title: string; files: SliceFile[] };

function packOf(leaves: SliceFile[][]): Pack {
  const folders = [...new Set(leaves.map((leaf) => commonFolder(leaf)))];
  const more = folders.length - TITLE_FOLDERS;
  const named = folders.slice(0, TITLE_FOLDERS).join(', ');
  return { title: more > 0 ? `${named} and ${more} more` : named, files: leaves.flat() };
}

/** `files` packed in path order into slices of about `target` lines, each named by its folders. */
function packByFolder(files: readonly SliceFile[], target: number): Pack[] {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  const packs: Pack[] = [];
  let current: SliceFile[][] = [];
  for (const leaf of partition(sorted, 1, target)) {
    if (current.length > 0 && sum(current.flat()) + sum(leaf) > target) {
      packs.push(packOf(current));
      current = [];
    }
    current = [...current, leaf];
  }
  return current.length > 0 ? [...packs, packOf(current)] : packs;
}

/** The change by folder, for a review without specs or whose grouping failed. */
export function slicesByFolder(sources: readonly SliceSource[]): ReviewSlice[] {
  const files = sources.map((source) => ({
    path: source.path,
    hunks: null,
    lines: source.hunks.reduce((total, hunk) => total + hunkLines(hunk), 0),
  }));
  const target = Math.max(SLICE_TARGET_LINES, Math.ceil(sum(files) / MAX_SLICES));
  return normalize(packByFolder(files, target).map((pack) => sliceOf(pack.title, pack.files)));
}

function join(x: string, y: string): string {
  return [x, y].filter((part) => part !== '').join('\n\n');
}

function merged(a: ReviewSlice, b: ReviewSlice): ReviewSlice {
  return sliceOf(
    `${a.title} + ${b.title}`,
    [...a.files, ...b.files],
    join(a.spec, b.spec),
    join(a.summary, b.summary),
  );
}

function splitLarge(slice: ReviewSlice): ReviewSlice[] {
  if (slice.lines <= MAX_SLICE_LINES || slice.files.length < 2) {
    return [slice];
  }
  return packByFolder(slice.files, SLICE_TARGET_LINES).map((pack) =>
    sliceOf(`${slice.title} (${pack.title})`, pack.files, slice.spec, slice.summary),
  );
}

/** Merges the adjacent pair with the fewest lines. */
function mergeSmallestPair(slices: ReviewSlice[]): ReviewSlice[] {
  let best = 0;
  for (let index = 1; index < slices.length - 1; index += 1) {
    const pair = (slices[index]?.lines ?? 0) + (slices[index + 1]?.lines ?? 0);
    if (pair < (slices[best]?.lines ?? 0) + (slices[best + 1]?.lines ?? 0)) {
      best = index;
    }
  }
  return mergeIntoNeighbour(slices, best + 1);
}

/** Merges the slice at `index` with the one before it (the one after, for the first). */
function mergeIntoNeighbour(slices: ReviewSlice[], index: number): ReviewSlice[] {
  const first = index === 0 ? 0 : index - 1;
  const [a, b] = [slices[first], slices[first + 1]];
  return a && b ? [...slices.slice(0, first), merged(a, b), ...slices.slice(first + 2)] : slices;
}

/** Splits the large slices, merges the small ones into a neighbour, and keeps at most `MAX_SLICES`. */
function normalize(slices: ReviewSlice[]): ReviewSlice[] {
  let result = slices
    .filter((slice) => slice.files.length > 0)
    .flatMap((slice) => splitLarge(slice));
  let small = result.findIndex((slice) => slice.lines < MIN_SLICE_LINES);
  while (small !== -1 && result.length > 1) {
    result = mergeIntoNeighbour(result, small);
    small = result.findIndex((slice) => slice.lines < MIN_SLICE_LINES);
  }
  while (result.length > MAX_SLICES) {
    result = mergeSmallestPair(result);
  }
  return result;
}
