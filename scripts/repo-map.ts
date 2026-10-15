// Writes `docs/map/<area>.md`, one line per source file; `--check` fails when one is out of date.
import { MAP_AREAS, renderMap, summaryOf, type MapArea } from './repo-map-lib';

const SOURCE = /\.tsx?$/u;
const LEFT_OUT = /\.test\.tsx?$|\.d\.ts$/u;

async function listFiles(): Promise<string[]> {
  const child = Bun.spawn(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
    stdout: 'pipe',
  });
  const output = await new Response(child.stdout).text();
  return output.split('\n').filter((file) => SOURCE.test(file) && !LEFT_OUT.test(file));
}

async function areaFiles(
  area: MapArea,
  all: string[],
): Promise<{ file: string; source: string }[]> {
  const inArea = all.filter((file) => file.startsWith(`${area.root}/`));
  const present = await Promise.all(inArea.map((file) => Bun.file(file).exists()));
  const files = inArea.filter((_, at) => present[at]);
  return Promise.all(files.map(async (file) => ({ file, source: await Bun.file(file).text() })));
}

const check = process.argv.includes('--check');
const all = await listFiles();
const stale: string[] = [];
const missing: string[] = [];
for (const area of MAP_AREAS) {
  // oxlint-disable-next-line no-await-in-loop -- five areas, read one after the other
  const files = await areaFiles(area, all);
  missing.push(
    ...files.filter(({ file, source }) => summaryOf(source, file) === null).map(({ file }) => file),
  );
  const target = `docs/map/${area.name}.md`;
  const map = renderMap(area, files);
  // oxlint-disable-next-line no-await-in-loop -- see above
  const current = (await Bun.file(target).exists()) ? await Bun.file(target).text() : '';
  if (current !== map) {
    stale.push(target);
    if (!check) {
      // oxlint-disable-next-line no-await-in-loop -- see above
      await Bun.write(target, map);
    }
  }
}
if (check && (stale.length > 0 || missing.length > 0)) {
  if (stale.length > 0) {
    console.error(`Out of date (run \`bun run map\`): ${stale.join(', ')}`);
  }
  if (missing.length > 0) {
    console.error(`No summary (start the file with a one-line // comment): ${missing.join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `${check ? 'Maps up to date' : `Wrote ${stale.length} map(s)`}; ${missing.length} file(s) without a summary.`,
  );
}
