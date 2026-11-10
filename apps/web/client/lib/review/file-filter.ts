// Narrows the review's changed files: by words of their path (or their old path), and to the files Union counts as code.

export type FileFilter = { query: string; codeOnly: boolean };

type Filterable = { path: string; oldPath: string; code: boolean };

/** Whether the filter leaves out any file at all. */
export function isFiltering(filter: FileFilter): boolean {
  return filter.codeOnly || filter.query.trim() !== '';
}

/** Every word of the query is in the path or in the old path, case ignored. */
function matches(file: Filterable, words: readonly string[]): boolean {
  const paths = [file.path.toLowerCase(), file.oldPath.toLowerCase()];
  return paths.some((path) => words.every((word) => path.includes(word)));
}

/** The files the filter keeps, in the order given: it narrows the list, it does not rank it. */
export function filterFiles<T extends Filterable>(files: readonly T[], filter: FileFilter): T[] {
  const words = filter.query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  return files.filter((file) => (!filter.codeOnly || file.code) && matches(file, words));
}
