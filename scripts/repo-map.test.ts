import { expect, test } from 'bun:test';

import { renderMap, summaryOf } from './repo-map-lib';

test("a file's top comment is its summary, first sentence only", () => {
  expect(
    summaryOf('// Runs the forwarder. More detail.\n// Second line.\nimport x from "y";'),
  ).toBe('Runs the forwarder.');
  expect(summaryOf('// oxlint-disable-next-line x -- y\n// The real one.\nconst a = 1;')).toBe(
    'The real one.',
  );
});

test('a file without a top `//` comment has no summary, whatever its doc comments', () => {
  expect(summaryOf('/**\n * The map of a part.\n */\nimport x from "y";')).toBeNull();
  expect(
    summaryOf("import x from 'y';\n/** Runs the commands. */\nexport class Runner {}"),
  ).toBeNull();
  expect(summaryOf("import x from 'y';\n// Not at the top.\nexport const a = 1;")).toBeNull();
});

test('the map lists each folder with its files and their summaries', () => {
  const map = renderMap({ name: 'w', root: 'apps/w' }, [
    { file: 'apps/w/b.ts', source: '// B does b.' },
    { file: 'apps/w/sub/a.ts', source: 'export const a = 1;' },
  ]);
  expect(map).toContain('## ./\n\n- `b.ts`: B does b.\n');
  expect(map).toContain('## sub/\n\n- `a.ts`: (no summary)\n');
});
