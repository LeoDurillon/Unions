import { expect, test } from 'bun:test';

import { renderMap, summaryOf } from './repo-map-lib';

test("a file's top comment is its summary, first sentence only", () => {
  expect(
    summaryOf('// Runs the forwarder. More detail.\n// Second line.\nimport x from "y";'),
  ).toBe('Runs the forwarder.');
  expect(summaryOf('/**\n * The map of a part.\n */\nimport x from "y";')).toBe(
    'The map of a part.',
  );
  expect(summaryOf('// oxlint-disable-next-line x -- y\n// The real one.\nconst a = 1;')).toBe(
    'The real one.',
  );
});

test('without one, the export named after the file wins over constants and types', () => {
  const source = [
    "import x from 'y';",
    '/** A list of names. */',
    'export const NAMES = [];',
    '/** A shape. */',
    'export type Shape = {};',
    '/** Runs the commands users queue. */',
    'export class ContainerRunner {}',
  ].join('\n');
  expect(summaryOf(source, 'apps/worker/src/container-run.ts')).toBe(
    'Runs the commands users queue.',
  );
  expect(summaryOf("import x from 'y';\nexport const a = 1;")).toBeNull();
});

test('the map lists each folder with its files and their summaries', () => {
  const map = renderMap({ name: 'w', root: 'apps/w' }, [
    { file: 'apps/w/b.ts', source: '// B does b.' },
    { file: 'apps/w/sub/a.ts', source: 'export const a = 1;' },
  ]);
  expect(map).toContain('## ./\n\n- `b.ts`: B does b.\n');
  expect(map).toContain('## sub/\n\n- `a.ts`: (no summary)\n');
});
