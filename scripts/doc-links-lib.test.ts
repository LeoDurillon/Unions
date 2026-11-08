// Tests of the doc-link check's link reader: relative targets only, anchors dropped, code left out.
import { expect, test } from 'bun:test';

import { relativeLinks } from './doc-links-lib';

test('relative links and images are read, without their anchor', () => {
  expect(
    relativeLinks('See [a](../plans/x.md#y), ![shot](img/b.png) and [c](c.md "title").'),
  ).toEqual(['../plans/x.md', 'img/b.png', 'c.md']);
});

test('external links, anchors alone and links in code are left out', () => {
  const text = [
    '[web](https://example.com) [mail](mailto:a@b.c) [here](#part) `[x](inline.md)`',
    '```',
    '[y](fenced.md)',
    '```',
  ].join('\n');
  expect(relativeLinks(text)).toEqual([]);
});
