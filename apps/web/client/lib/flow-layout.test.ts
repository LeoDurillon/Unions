import { expect, test } from 'bun:test';

import { layoutFlow, NODE_HEIGHT, NODE_WIDTH } from './flow-layout';

function rows(ids: string[], links: { from: string; to: string }[]): string[][] {
  const { at } = layoutFlow(ids, links);
  const byY = new Map<number, { id: string; x: number }[]>();
  for (const id of ids) {
    const place = at.get(id) ?? { x: 0, y: 0 };
    byY.set(place.y, [...(byY.get(place.y) ?? []), { id, x: place.x }]);
  }
  return [...byY.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, row]) => row.toSorted((a, b) => a.x - b.x).map((node) => node.id));
}

test('each node sits below the deepest node pointing at it; a starting node just above its target', () => {
  expect(
    rows(
      ['page', 'header', 'helper', 'shared', 'export'],
      [
        { from: 'page', to: 'header' },
        { from: 'page', to: 'helper' },
        { from: 'helper', to: 'shared' },
        { from: 'export', to: 'shared' },
        { from: 'header', to: 'shared' },
      ],
    ),
  ).toEqual([['page'], ['header', 'helper', 'export'], ['shared']]);
});

test('a cycle does not loop: the link closing it is left out of the layers', () => {
  expect(
    rows(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    ),
  ).toEqual([['a'], ['b'], ['c']]);
});

test('a node is ordered near the ones it comes from', () => {
  expect(
    rows(
      ['left', 'right', 'underRight', 'underLeft'],
      [
        { from: 'right', to: 'underRight' },
        { from: 'left', to: 'underLeft' },
      ],
    ),
  ).toEqual([
    ['left', 'right'],
    ['underLeft', 'underRight'],
  ]);
});

test('the map is as wide as its widest layer, rows centred', () => {
  const { at, width, height } = layoutFlow(
    ['a', 'b', 'c'],
    [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ],
  );
  expect(width).toBe(2 * NODE_WIDTH + 24);
  expect(height).toBe(2 * NODE_HEIGHT + 64);
  expect(at.get('a')?.x).toBe((width - NODE_WIDTH) / 2);
});
