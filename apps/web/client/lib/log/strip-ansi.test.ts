import { expect, test } from 'bun:test';

import { stripAnsi } from './strip-ansi';

test('colour codes go, the text stays', () => {
  expect(stripAnsi('\u001B[36mapi:dev:\u001B[0m ready \u001B[32mINFO\u001B[39m')).toBe(
    'api:dev: ready INFO',
  );
  expect(stripAnsi('plain')).toBe('plain');
});
