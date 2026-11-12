// Which files of a review the user marked viewed, remembered in this browser per review. A file is one path at a
// given size: once its lines added or removed change, it is no longer viewed.
const PREFIX = 'union.review.viewed.';

type Sized = { path: string; additions: number; deletions: number };

/** The file as the mark remembers it: its path and how many lines it adds and removes. */
export function viewedKey(file: Sized): string {
  return `${file.path}:${file.additions}:${file.deletions}`;
}

/** The marks of one review (`review`: its API base, the same for its tabs and reloads). */
export function readViewed(review: string): Set<string> {
  try {
    const raw = globalThis.localStorage.getItem(PREFIX + review);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : []);
  } catch {
    // Storage blocked or unreadable: nothing is marked.
    return new Set();
  }
}

export function writeViewed(review: string, keys: ReadonlySet<string>): void {
  try {
    globalThis.localStorage.setItem(PREFIX + review, JSON.stringify([...keys]));
  } catch {
    // Storage blocked: the marks last until the page closes.
  }
}

/** The marks with `file` marked or unmarked. */
export function toggledViewed(keys: ReadonlySet<string>, file: Sized): Set<string> {
  const next = new Set(keys);
  const key = viewedKey(file);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** How many of `files` are marked. */
export function viewedCount(files: readonly Sized[], keys: ReadonlySet<string>): number {
  return files.filter((file) => keys.has(viewedKey(file))).length;
}
