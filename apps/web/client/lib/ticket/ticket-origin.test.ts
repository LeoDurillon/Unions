import { expect, test } from 'bun:test';

import { originName, shownBody } from './ticket-origin';

test("a ticket's origin is named by its kind, and its imported markup cleaned", () => {
  expect(originName('notion')).toBe('Notion page');
  expect(originName(null)).toBeNull();
  const body = '<callout>\n\tNote\n</callout>';
  expect(shownBody({ originKind: null, body })).toBe(body);
  expect(shownBody({ originKind: 'notion', body })).not.toContain('<callout');
});
