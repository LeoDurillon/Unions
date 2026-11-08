// Moves source files into a folder and rewrites every relative import to and from them; `bun scripts/move-files.ts <folder> <file>...`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { $, Glob } from 'bun';

import { detachHeader, rewriteImports } from './move-files-lib';

const ROOT = path.resolve(import.meta.dir, '..');
const SOURCES = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}', 'scripts/**/*.ts'];
/** Files that name source paths by hand: printed when they name a moved file, to edit. */
const PATH_LISTS = ['ast-grep/rules/*.yml', '.oxlintrc.json', 'knip.json', '.jscpd.json'];
const CORE_PACKAGE = 'packages/core/package.json';

const [folder, ...moving] = process.argv.slice(2);
if (!folder || moving.length === 0) {
  console.error('Usage: bun scripts/move-files.ts <folder> <file>...');
  process.exit(1);
}

async function scan(patterns: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const pattern of patterns) {
    const files = await Array.fromAsync(new Glob(pattern).scan({ cwd: ROOT, dot: true }));
    found.push(...files.filter((file) => !file.includes('node_modules/')));
  }
  return found;
}

const files = new Set(await scan(SOURCES));
const moves = new Map(
  moving.map((file) => [file, path.posix.join(folder, path.posix.basename(file))]),
);
for (const file of moves.keys()) {
  if (!files.has(file)) {
    console.error(`Not a source file: ${file}`);
    process.exit(1);
  }
}

const rewritten = new Map<string, string>();
for (const file of files) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const imports = rewriteImports(source, file, moves, files);
  // Only a file whose imports changed is written, with its header kept off the sorted imports.
  if (imports !== source) {
    rewritten.set(file, detachHeader(imports));
  }
}

await mkdir(path.join(ROOT, folder), { recursive: true });
for (const [from, to] of moves) {
  await $`git mv ${from} ${to}`.cwd(ROOT).quiet();
}
for (const [file, source] of rewritten) {
  await writeFile(path.join(ROOT, moves.get(file) ?? file), source);
}

let pkg = await readFile(path.join(ROOT, CORE_PACKAGE), 'utf8');
for (const [from, to] of moves) {
  if (from.startsWith('packages/core/')) {
    pkg = pkg.replaceAll(
      `"./${from.slice('packages/core/'.length)}"`,
      `"./${to.slice('packages/core/'.length)}"`,
    );
  }
}
await writeFile(path.join(ROOT, CORE_PACKAGE), pkg);

for (const list of await scan(PATH_LISTS)) {
  const text = await readFile(path.join(ROOT, list), 'utf8');
  const named = [...moves.keys()].filter((file) => text.includes(file));
  if (named.length > 0) {
    console.log(`Edit by hand: ${list} names ${named.join(', ')}`);
  }
}
console.log(
  `Moved ${moves.size} files into ${folder}; rewrote imports in ${rewritten.size} files.`,
);
// The rewritten imports may need sorting again; the maps follow the moved files.
await $`bun run fmt`.cwd(ROOT).quiet();
await $`bun run map`.cwd(ROOT).quiet();
