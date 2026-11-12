import { expect, test } from 'bun:test';

import { renderMaps, summaryOf } from './repo-map-lib';

test("a file's top comment is its summary, first sentence only", () => {
  expect(
    summaryOf('// Runs the forwarder. More detail.\n// Second line.\nimport x from "y";'),
  ).toBe('Runs the forwarder.');
  expect(summaryOf('// oxlint-disable-next-line x -- y\n// The real one.\nconst a = 1;')).toBe(
    'The real one.',
  );
});

test('a sentence does not end inside a `code` span', () => {
  expect(summaryOf('// The `fixup! <sha>` targets, and `a?` too. Then more.')).toBe(
    'The `fixup! <sha>` targets, and `a?` too.',
  );
});

test('a long first sentence is kept whole, for the check to report rather than cut', () => {
  const long = `// ${'word '.repeat(40).trim()}.`;
  expect(summaryOf(long)?.length).toBe(long.length - '// '.length);
});

test('a file without a top `//` comment has no summary, whatever its doc comments', () => {
  expect(summaryOf('/**\n * The map of a part.\n */\nimport x from "y";')).toBeNull();
  expect(
    summaryOf("import x from 'y';\n/** Runs the commands. */\nexport class Runner {}"),
  ).toBeNull();
  expect(summaryOf("import x from 'y';\n// Not at the top.\nexport const a = 1;")).toBeNull();
});

test('the index links each folder to its map, and each map lists its files', () => {
  const area = { name: 'w', root: 'apps/w' };
  const maps = renderMaps(
    [
      {
        area,
        files: [
          { file: 'apps/w/sub/a.ts', source: 'export const a = 1;' },
          { file: 'apps/w/b.ts', source: '// B does b.' },
        ],
      },
    ],
    { w: 'The root.', 'w/sub': 'The sub folder.', 'w/gone': 'Nothing.' },
  );
  expect([...maps.files.keys()]).toEqual(['README.md', 'w/root.md', 'w/sub.md']);
  const index = maps.files.get('README.md') ?? '';
  expect(index).toContain(
    '- [`./`](w/root.md), 1 file: The root.\n- [`sub/`](w/sub.md), 1 file: The sub folder.',
  );
  expect(maps.files.get('w/root.md')).toContain('# Map: `apps/w/`\n\nThe root.');
  expect(maps.files.get('w/root.md')).toContain('- `b.ts`: B does b.\n');
  expect(maps.files.get('w/sub.md')).toContain('- `a.ts`: (no summary)\n');
  expect(maps.undescribed).toEqual([]);
  expect(maps.unused).toEqual(['w/gone']);
});

test('a folder without a summary is reported', () => {
  const maps = renderMaps(
    [{ area: { name: 'w', root: 'apps/w' }, files: [{ file: 'apps/w/x/a.ts', source: '// A.' }] }],
    {},
  );
  expect(maps.undescribed).toEqual(['w/x']);
});
