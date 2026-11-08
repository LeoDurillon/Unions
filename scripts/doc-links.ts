// Fails when a link in the docs, the user guide, AGENTS.md or README.md points at a file that does not exist.
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Glob } from 'bun';

import { relativeLinks } from './doc-links-lib';

const ROOT = path.resolve(import.meta.dir, '..');
const FILES = ['docs/**/*.md', 'documentation/**/*.md', 'AGENTS.md', 'README.md'];

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
  return checked.filter((line) => line !== null);
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
