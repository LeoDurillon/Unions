import { expect, test } from 'bun:test';

import { mergedLines } from './merged-lines';

async function* chunks(parts: string[]): AsyncGenerator<string> {
  for (const part of parts) {
    await Bun.sleep(1);
    yield part;
  }
}

async function* failing(): AsyncGenerator<string> {
  await Bun.sleep(1);
  yield 'kept\n';
  throw new Error('broken');
}

test('yields every line of every source, a last unterminated one included', async () => {
  const lines: string[] = [];
  for await (const line of mergedLines([chunks(['a\nb', 'c\n']), chunks(['x\n', 'y'])])) {
    lines.push(line);
  }
  expect(lines.toSorted()).toEqual(['a', 'bc', 'x', 'y']);
});

test('a failing source ends alone', async () => {
  const lines: string[] = [];
  for await (const line of mergedLines([failing(), chunks(['other\n'])])) {
    lines.push(line);
  }
  expect(lines.toSorted()).toEqual(['kept', 'other']);
});

test('no source: no line', async () => {
  const lines: string[] = [];
  for await (const line of mergedLines([])) {
    lines.push(line);
  }
  expect(lines).toEqual([]);
});
