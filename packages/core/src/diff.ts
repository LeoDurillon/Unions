// Unified diff parsing (output of `git diff`). Pure and browser-safe: the worker splits a branch diff
// into files to store, and the review page parses one file's patch into lines to render.

export type DiffStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export type DiffFile = {
  path: string;
  /** Differs from `path` only for renames. */
  oldPath: string;
  status: DiffStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** This file's section of the diff, headers included. */
  patch: string;
};

export type DiffLine =
  | { kind: 'hunk'; text: string }
  | { kind: 'context'; oldLine: number; newLine: number; text: string }
  | { kind: 'add'; newLine: number; text: string }
  | { kind: 'del'; oldLine: number; text: string }
  | { kind: 'meta'; text: string };

const FILE_START = 'diff --git ';
const HUNK = /^@@ -(?<old>\d+)(?:,\d+)? \+(?<new>\d+)(?:,\d+)? @@/u;

const OCTAL_ESCAPE = /^[0-7]{3}/u;
const OCTAL_DIGITS = 3;
const OCTAL = 8;
const MARKER_LENGTH = '--- '.length;
const RENAME_FROM = 'rename from ';
const RENAME_TO = 'rename to ';

/** Git quotes paths with unusual characters: "a/caf\303\251.txt". */
function unquote(path: string): string {
  if (!path.startsWith('"')) {
    return path;
  }
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  for (let index = 0; index < body.length; index++) {
    const char = body[index] ?? '';
    const octal = body.slice(index + 1, index + 1 + OCTAL_DIGITS);
    if (char === '\\' && OCTAL_ESCAPE.test(octal)) {
      bytes.push(Number.parseInt(octal, OCTAL));
      index += OCTAL_DIGITS;
    } else if (char === '\\') {
      index += 1;
      bytes.push(...new TextEncoder().encode(body[index] ?? ''));
    } else {
      bytes.push(...new TextEncoder().encode(char));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function stripPrefix(path: string): string {
  const plain = unquote(path.trim());
  return plain.startsWith('a/') || plain.startsWith('b/') ? plain.slice(2) : plain;
}

function findLine(block: string[], prefix: string, skip?: string): string | undefined {
  return block.find((line) => line.startsWith(prefix) && line !== skip);
}

/** Binary or mode-only changes have no ---/+++ lines: read `diff --git a/x b/x` instead. */
function pathFromHeader(line: string): string {
  const header = line.slice(FILE_START.length);
  const middle = header.indexOf(' b/');
  return middle === -1 ? header : header.slice(middle + ' b/'.length);
}

/** Paths from `rename from/to`, else from the ---/+++ markers, else from the `diff --git` header. */
function headerPaths(block: string[]): { path: string; oldPath: string } {
  const renameFrom = findLine(block, RENAME_FROM);
  const renameTo = findLine(block, RENAME_TO);
  const minus = findLine(block, '--- ', '--- /dev/null');
  const plus = findLine(block, '+++ ', '+++ /dev/null');
  let oldPath = renameFrom ? unquote(renameFrom.slice(RENAME_FROM.length)) : '';
  let path = renameTo ? unquote(renameTo.slice(RENAME_TO.length)) : '';
  oldPath ||= minus ? stripPrefix(minus.slice(MARKER_LENGTH)) : '';
  path ||= plus ? stripPrefix(plus.slice(MARKER_LENGTH)) : '';
  path ||= oldPath || pathFromHeader(block[0] ?? '');
  oldPath ||= path;
  return { path, oldPath };
}

function statusOf(block: string[]): DiffStatus {
  if (block.some((line) => line.startsWith('new file mode'))) {
    return 'added';
  }
  if (block.some((line) => line.startsWith('deleted file mode'))) {
    return 'deleted';
  }
  return block.some((line) => line.startsWith(RENAME_FROM)) ? 'renamed' : 'modified';
}

function countChanges(block: string[]): { additions: number; deletions: number } {
  const start = block.findIndex((line) => line.startsWith('@@'));
  const body = start === -1 ? [] : block.slice(start);
  return {
    additions: body.filter((line) => line.startsWith('+')).length,
    deletions: body.filter((line) => line.startsWith('-')).length,
  };
}

function toFile(block: string[]): DiffFile {
  return {
    ...headerPaths(block),
    status: statusOf(block),
    binary: block.some((line) => line.startsWith('Binary files ')),
    ...countChanges(block),
    patch: block.join('\n'),
  };
}

/** Splits a whole `git diff` into one entry per file. */
export function parseDiff(text: string): DiffFile[] {
  const files: string[][] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith(FILE_START)) {
      files.push([line]);
    } else {
      files.at(-1)?.push(line);
    }
  }
  return files.map((block) => toFile(block.at(-1) === '' ? block.slice(0, -1) : block));
}

/** The lines of one file's patch, numbered on both sides, for rendering. */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const text of patch.split('\n')) {
    const hunk = HUNK.exec(text)?.groups;
    if (hunk) {
      oldLine = Number(hunk.old);
      newLine = Number(hunk.new);
      inHunk = true;
      lines.push({ kind: 'hunk', text });
    } else if (!inHunk) {
      // file headers: not rendered
    } else if (text.startsWith('+')) {
      lines.push({ kind: 'add', newLine: newLine++, text: text.slice(1) });
    } else if (text.startsWith('-')) {
      lines.push({ kind: 'del', oldLine: oldLine++, text: text.slice(1) });
    } else if (text.startsWith('\\')) {
      lines.push({ kind: 'meta', text });
    } else {
      lines.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, text: text.slice(1) });
    }
  }
  return lines;
}

/** Generated files hidden from the review unless the project turns this off. */
export const LOCK_FILES = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  'flake.lock',
] as const;

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/gu;

/**
 * Gitignore-style pattern to a regular expression: `*` and `?` stay within a path segment, `**`
 * crosses them, a pattern without `/` matches at any depth, a leading `/` anchors at the root, a
 * trailing `/` matches everything under that directory.
 */
function patternToRegex(pattern: string): RegExp {
  const directory = pattern.endsWith('/');
  const anchored = pattern.startsWith('/') || pattern.slice(0, -1).includes('/');
  const core = pattern.replace(/^\//u, '').replace(/\/$/u, '');
  const body = core
    .replaceAll(REGEX_SPECIAL, String.raw`\$&`)
    .replaceAll('**/', '\u0000')
    .replaceAll('**', '\u0001')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll('\u0000', '(?:.*/)?')
    .replaceAll('\u0001', '.*');
  const prefix = anchored ? '^' : '^(?:.*/)?';
  const suffix = directory ? '/.*$' : '(?:/.*)?$';
  return new RegExp(`${prefix}${body}${suffix}`, 'u');
}

/** Whether the review hides `path`: lock files (unless turned off) and the project's own patterns. */
export function isIgnoredPath(
  path: string,
  patterns: readonly string[],
  hideLockFiles: boolean,
): boolean {
  const all = hideLockFiles ? [...LOCK_FILES, ...patterns] : patterns;
  return all
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern !== '' && !pattern.startsWith('#'))
    .some((pattern) => patternToRegex(pattern).test(path));
}
