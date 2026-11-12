// Writes `docs/map/`: an index of the folders and a map of each; `--check` fails when one is out of date.
import { rm } from 'node:fs/promises';

import { Glob } from 'bun';

import { FOLDER_SUMMARIES } from './repo-map-folders';
import { MAP_AREAS, renderMaps, summaryOf, type MapArea, type SourceFile } from './repo-map-lib';

const MAP_DIR = 'docs/map';
const SOURCE = /\.tsx?$/u;
const LEFT_OUT = /\.test\.tsx?$|\.d\.ts$/u;

async function listFiles(): Promise<string[]> {
  const child = Bun.spawn(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
    stdout: 'pipe',
  });
  const output = await new Response(child.stdout).text();
  return output.split('\n').filter((file) => SOURCE.test(file) && !LEFT_OUT.test(file));
}

async function areaFiles(area: MapArea, all: string[]): Promise<SourceFile[]> {
  const inArea = all.filter((file) => file.startsWith(`${area.root}/`));
  const present = await Promise.all(inArea.map((file) => Bun.file(file).exists()));
  const files = inArea.filter((_, at) => present[at]);
  return Promise.all(files.map(async (file) => ({ file, source: await Bun.file(file).text() })));
}

/** The maps that differ from what is on disk. */
async function changedMaps(files: Map<string, string>): Promise<string[]> {
  const changed = await Promise.all(
    [...files].map(async ([file, text]) => {
      const target = Bun.file(`${MAP_DIR}/${file}`);
      return (await target.exists()) && (await target.text()) === text ? null : file;
    }),
  );
  return changed.filter((file) => file !== null);
}

/** Prints each non-empty list under its label; true when there was one. */
function report(problems: [string, string[]][]): boolean {
  const failing = problems.filter(([, items]) => items.length > 0);
  for (const [label, items] of failing) {
    console.error(`${label}: ${items.join(', ')}`);
  }
  return failing.length > 0;
}

const check = process.argv.includes('--check');
const all = await listFiles();
const areas = await Promise.all(
  MAP_AREAS.map(async (area) => ({ area, files: await areaFiles(area, all) })),
);
const missing = areas.flatMap(({ files }) =>
  files.filter(({ source }) => summaryOf(source) === null).map(({ file }) => file),
);
const maps = renderMaps(areas, FOLDER_SUMMARIES);
const changed = await changedMaps(maps.files);
const onDisk = await Array.fromAsync(new Glob('**/*.md').scan({ cwd: MAP_DIR })).catch(
  (): string[] => [],
);
const extra = onDisk.filter((file) => !maps.files.has(file));
const problems: [string, string[]][] = [
  ['No summary (start the file with a one-line // comment)', missing],
  ['No folder summary (add one to scripts/repo-map-folders.ts)', maps.undescribed],
  ['Summary of no folder (remove it from scripts/repo-map-folders.ts)', maps.unused],
];
if (check) {
  if (report([['Out of date (run `bun run map`)', [...changed, ...extra]], ...problems])) {
    process.exitCode = 1;
  } else {
    console.log('Maps up to date.');
  }
} else {
  await Promise.all(
    changed.map((file) => Bun.write(`${MAP_DIR}/${file}`, maps.files.get(file) ?? '')),
  );
  await Promise.all(extra.map((file) => rm(`${MAP_DIR}/${file}`)));
  report(problems);
  console.log(`Wrote ${changed.length} map(s), removed ${extra.length}.`);
}
