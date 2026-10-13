export type TreeNode<T> =
  | { kind: 'dir'; name: string; path: string; children: TreeNode<T>[] }
  | { kind: 'file'; name: string; file: T };

type Dir<T> = { dirs: Map<string, Dir<T>>; files: { name: string; file: T }[] };

function emptyDir<T>(): Dir<T> {
  return { dirs: new Map(), files: [] };
}

function insert<T extends { path: string }>(root: Dir<T>, file: T): void {
  const parts = file.path.split('/');
  const name = parts.pop() ?? file.path;
  let dir = root;
  for (const part of parts) {
    let next = dir.dirs.get(part);
    if (!next) {
      next = emptyDir();
      dir.dirs.set(part, next);
    }
    dir = next;
  }
  dir.files.push({ name, file });
}

/** The directory's one subdirectory, when it has exactly one. */
function onlyDir<T>(dir: Dir<T>): [string, Dir<T>] | null {
  const [first, ...rest] = dir.dirs.entries();
  return first && rest.length === 0 ? first : null;
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

/** Directories first, then files, each by name; a directory holding only one directory is merged into it. */
function nodesOf<T>(dir: Dir<T>, prefix: string): TreeNode<T>[] {
  const dirs = [...dir.dirs.entries()]
    .map(([name, child]) => {
      let label = name;
      let current = child;
      let only = current.files.length === 0 ? onlyDir(current) : null;
      while (only) {
        label = `${label}/${only[0]}`;
        [, current] = only;
        only = current.files.length === 0 ? onlyDir(current) : null;
      }
      const path = `${prefix}${label}`;
      return { kind: 'dir' as const, name: label, path, children: nodesOf(current, `${path}/`) };
    })
    .toSorted(byName);
  const files = dir.files.toSorted(byName).map(({ name, file }) => ({
    kind: 'file' as const,
    name,
    file,
  }));
  return [...dirs, ...files];
}

/** The files as a directory tree, for the review's file list. */
export function buildFileTree<T extends { path: string }>(files: T[]): TreeNode<T>[] {
  const root = emptyDir<T>();
  for (const file of files) {
    insert(root, file);
  }
  return nodesOf(root, '');
}
