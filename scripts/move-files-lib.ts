// Rewrites the relative imports of a source file after files moved: the move script's pure part.
import path from 'node:path';

/** `from './x'`, `import './x'`, `import('./x')` and `export … from './x'`: the relative specifiers. */
// Named groups are numbered too: the replacer reads them as its positional arguments.
const SPECIFIER =
  /(?<lead>\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(?<quote>['"])(?<spec>\.{1,2}\/[^'"]+)\k<quote>/gu;
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** The file a relative specifier names, among `files` (repository paths), or null. */
export function resolveSpecifier(
  importer: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (files.has(base)) {
    return base;
  }
  return EXTENSIONS.map((ext) => base + ext).find((candidate) => files.has(candidate)) ?? null;
}

/** The specifier from `from` (a file) to `to` (a file), written the way `original` was (with or without extension). */
function specifierBetween(from: string, to: string, original: string): string {
  let target = to;
  if (!/\.[cm]?[jt]sx?$/u.test(original) && /\.tsx?$/u.test(to)) {
    target = to.replace(/\.tsx?$/u, '');
    if (target.endsWith('/index') && !original.endsWith('/index')) {
      target = target.slice(0, -'/index'.length);
    }
  }
  const relative = path.posix.relative(path.posix.dirname(from), target);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

/**
 * The source of `importer` (at its old path) with each relative import pointing where its file now is,
 * written from the importer's new path. `moves` maps old paths to new ones; `files` is every file before.
 */
export function rewriteImports(
  source: string,
  importer: string,
  moves: ReadonlyMap<string, string>,
  files: ReadonlySet<string>,
): string {
  const newImporter = moves.get(importer) ?? importer;
  return source.replaceAll(SPECIFIER, (match, lead: string, quote: string, spec: string) => {
    const target = resolveSpecifier(importer, spec, files);
    if (target === null) {
      return match;
    }
    const newTarget = moves.get(target) ?? target;
    if (newTarget === target && newImporter === importer) {
      return match;
    }
    return `${lead}${quote}${specifierBetween(newImporter, newTarget, spec)}${quote}`;
  });
}

/**
 * The file with a blank line after its top `//` comment. Without one, the formatter treats the comment as
 * the first import's and moves it with that import when the rewritten imports are sorted again.
 */
export function detachHeader(source: string): string {
  const lines = source.split('\n');
  const end = lines.findIndex((line) => !line.startsWith('//'));
  return end > 0 && lines[end] !== ''
    ? [...lines.slice(0, end), '', ...lines.slice(end)].join('\n')
    : source;
}
