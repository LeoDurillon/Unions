// How much code a change adds: its lines added outside tests and generated files, counted from a diff or `git diff --numstat` (browser-safe).
import { isIgnoredPath, LOCK_FILES } from './diff';

/** Paths that count as tests: left out of the code, counted apart. */
const TEST_PATTERNS = [
  '*.test.*',
  '*.spec.*',
  '*_test.*',
  'test_*.py',
  '__tests__/',
  'test/',
  'tests/',
  'e2e/',
  '*.snap',
] as const;

/** What is not code when the project sets no patterns of its own: tests, lock files, migrations, docs. */
export const DEFAULT_SIZE_IGNORE: readonly string[] = [
  ...TEST_PATTERNS,
  ...LOCK_FILES,
  'migrations/',
  '*.md',
];

/** One changed file, as a diff snapshot or `git diff --numstat` gives it. */
export type SizedFile = { path: string; additions: number; deletions: number; binary?: boolean };

export type ChangeSize = {
  /** Lines of code added: the measure the budget is checked against. */
  code: number;
  /** Lines of code removed: shown, never counted against the budget. */
  removed: number;
  /** Lines added in tests. */
  tests: number;
  /** Lines added in the other files left out (lock files, migrations, docs, the project's patterns). */
  other: number;
  /** The files counted as code, most lines added first. */
  codeFiles: { path: string; additions: number }[];
};

/** The patterns that leave a path out of the code: the project's own, else the defaults. */
export function sizeIgnoreOf(config: { sizeIgnore?: string[] }): readonly string[] {
  return config.sizeIgnore ?? DEFAULT_SIZE_IGNORE;
}

/** Whether Union counts a file as code: not binary, and outside the size patterns `ignore`. */
export function isCodeFile(
  file: { path: string; binary?: boolean },
  ignore: readonly string[],
): boolean {
  return file.binary !== true && !isIgnoredPath(file.path, ignore, false);
}

/** Splits a change into code, tests and the rest; binary files count nowhere. */
export function measureChange(files: readonly SizedFile[], ignore: readonly string[]): ChangeSize {
  const size: ChangeSize = { code: 0, removed: 0, tests: 0, other: 0, codeFiles: [] };
  for (const file of files.filter((sized) => sized.binary !== true)) {
    if (isCodeFile(file, ignore)) {
      size.code += file.additions;
      size.removed += file.deletions;
      if (file.additions > 0) {
        size.codeFiles.push({ path: file.path, additions: file.additions });
      }
    } else if (isIgnoredPath(file.path, TEST_PATTERNS, false)) {
      size.tests += file.additions;
    } else {
      size.other += file.additions;
    }
  }
  size.codeFiles.sort((a, b) => b.additions - a.additions);
  return size;
}

/** `git diff --numstat -z --no-renames`: `added\tdeleted\tpath` records ended by NUL, `-` for binary files. */
export function parseNumstat(text: string): SizedFile[] {
  return text
    .split('\0')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [added = '', deleted = '', ...path] = record.replace(/^\n/u, '').split('\t');
      const binary = added === '-';
      return {
        path: path.join('\t'),
        additions: binary ? 0 : Number(added),
        deletions: binary ? 0 : Number(deleted),
        binary,
      };
    });
}
