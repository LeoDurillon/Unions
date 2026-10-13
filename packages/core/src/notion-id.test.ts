import { expect, test } from 'bun:test';

import { parseNotionId } from './notion-id';

const ID = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';

test('bare ids, dashed or not, are normalized', () => {
  expect(parseNotionId(ID.toUpperCase())).toBe(ID);
  expect(parseNotionId(ID.replaceAll('-', ''))).toBe(ID);
});

test('ids are read from notion URLs, ignoring the query string and title slug', () => {
  expect(
    parseNotionId(`https://www.notion.so/acme/Add-search-${ID.replaceAll('-', '')}?pvs=4`),
  ).toBe(ID);
  expect(
    parseNotionId(
      `https://www.notion.so/${ID.replaceAll('-', '')}?v=ffffffffffffffffffffffffffffffff`,
    ),
  ).toBe(ID);
});

test('anything without an id is refused', () => {
  expect(parseNotionId('https://www.notion.so/acme/Add-search')).toBeNull();
  expect(parseNotionId('42')).toBeNull();
});

test('a slug ending in hex letters does not shift the id', () => {
  const bare = ID.replaceAll('-', '');
  expect(parseNotionId(`https://www.notion.so/acme/Dark-mode-${bare}?pvs=4`)).toBe(ID);
  expect(parseNotionId(`https://www.notion.so/acme/Add-feed-${bare}`)).toBe(ID);
  expect(parseNotionId(`https://www.notion.so/acme/${ID}`)).toBe(ID);
});
