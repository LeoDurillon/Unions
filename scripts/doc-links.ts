// Fails when a link in the docs, the user guide, AGENTS.md or README.md points at a file that does not exist, or a living doc names a source path that is gone.
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Glob } from 'bun';

import { relativeLinks, sourcePaths } from './doc-links-lib';

const ROOT = path.resolve(import.meta.dir, '..');
const FILES = ['docs/**/*.md', 'documentation/**/*.md', 'AGENTS.md', 'README.md'];
/** Where a named source path must still exist: not the archived plans, which keep the paths of their time. */
const LIVING =
  /^(?:docs\/(?:architecture|spec)\/|documentation\/|AGENTS\.md|README\.md|docs\/plans\/README\.md)/u;

function exists(target: string): Promise<boolean> {
  return access(target).then(
    () => true,
    () => false,
  );
}

/** The links of one file that point at no file, as `file: target`. */
async function brokenIn(file: string): Promise<string[]> {
  const text = await readFile(path.join(ROOT, file), 'utf8');
  const checked = await Promise.all(
    relativeLinks(text).map(async (target) => {
      const resolved = target.startsWith('/')
        ? path.join(ROOT, target)
        : path.resolve(ROOT, path.dirname(file), target);
      return (await exists(resolved)) ? null : `${file}: ${target}`;
    }),
  );
  const named = LIVING.test(file) ? sourcePaths(text) : [];
  const paths = await Promise.all(
    named.map(async (source) =>
      (await exists(path.join(ROOT, source))) ? null : `${file}: names ${source}`,
    ),
  );
  return [...checked, ...paths].filter((line) => line !== null);
}

const files: string[] = [];
for (const pattern of FILES) {
  files.push(...(await Array.fromAsync(new Glob(pattern).scan({ cwd: ROOT }))));
}
const perFile = await Promise.all(files.map((file) => brokenIn(file)));
const broken = perFile.flat();
if (broken.length > 0) {
  console.error(`Links to files that do not exist (${broken.length}):\n${broken.join('\n')}`);
  process.exit(1);
}
console.log(`Every doc link points at a file (${files.length} files).`);
