import { expect, test } from 'bun:test';

import { notionUrlsIn } from './notion-links';

const ID = '3df719182945803d8aeadc7a9b5e9ac1';
const DASHED = '3df71918-2945-803d-8aea-dc7a9b5e9ac1';
const OTHER = 'aaaaaaaabbbb4ccc8dddeeeeeeeeeeee';

test('Notion links of a description, once per page, in their order', () => {
  const text = [
    `Spec: [Export](https://www.notion.so/acme/Export-to-CSV-${ID}?pvs=4).`,
    `Again: https://app.notion.com/p/Export-${ID}, and <https://acme.notion.site/${OTHER}>`,
    `Not Notion: https://example.com/${OTHER} https://notion.so.evil.com/${OTHER}`,
  ].join('\n');
  expect(notionUrlsIn(text)).toEqual([
    { id: DASHED, url: `https://www.notion.so/acme/Export-to-CSV-${ID}?pvs=4` },
    { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', url: `https://acme.notion.site/${OTHER}` },
  ]);
});

test('a Notion URL without a page id, or no link at all, gives nothing', () => {
  expect(notionUrlsIn('See https://www.notion.so/acme and the ticket.')).toEqual([]);
  expect(notionUrlsIn('')).toEqual([]);
});
