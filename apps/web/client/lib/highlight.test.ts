import { expect, test } from 'bun:test';

import { parsePatch } from '@union/core/diff';

import { highlightDiff, languageFor, tokenize } from './highlight';

test('the language comes from the extension or a well-known file name', () => {
  expect(languageFor('apps/web/src/app.tsx')).toBe('tsx');
  expect(languageFor('scripts/run.py')).toBe('py');
  expect(languageFor('docker/Dockerfile.agent')).toBe('dockerfile');
  expect(languageFor('LICENSE')).toBeNull();
  expect(languageFor('data.unknownext')).toBeNull();
});

test('tokens are split per line, with their column and classes', () => {
  const lines = tokenize('const a = 1;\n/* one\ntwo */', 'ts');
  expect(lines).toHaveLength(3);
  expect(lines[0]?.[0]).toEqual({ text: 'const', className: 'hljs-keyword', start: 0 });
  expect(lines[0]?.map((token) => token.text).join('')).toBe('const a = 1;');
  // The comment spans two lines and keeps its class on both.
  expect(lines[2]).toEqual([{ text: 'two */', className: 'hljs-comment', start: 0 }]);
});

test('each side of a hunk is highlighted as one block; unknown languages stay plain', () => {
  const lines = parsePatch('@@ -1,2 +1,2 @@\n-/* old\n+// new\n  still */');
  const tokens = highlightDiff(lines, 'ts');
  const classes = (index: number): string[] => {
    const line = lines[index];
    return line ? (tokens.get(line) ?? []).map((token) => token.className) : [];
  };
  expect(classes(1)).toEqual(['hljs-comment']);
  expect(classes(2)).toEqual(['hljs-comment']);
  // On the new side the comment is over: "still */" is plain code there.
  expect(classes(3)).not.toContain('hljs-comment');
  expect(highlightDiff(lines, null).size).toBe(0);
});
