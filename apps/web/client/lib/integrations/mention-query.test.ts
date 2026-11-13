import { expect, test } from 'bun:test';

import { insertMention, mentionAt } from './mention-query';

test('the @name the caret ends, from the start or after a space', () => {
  expect(mentionAt('@ad', 3)).toEqual({ start: 0, query: 'ad' });
  expect(mentionAt('Hi @Ada Lo', 10)).toEqual({ start: 3, query: 'Ada Lo' });
  expect(mentionAt('Hi (@', 5)).toEqual({ start: 4, query: '' });
});

test('not in an email address, past a line break or a space right after the @', () => {
  expect(mentionAt('mail ada@acme.com', 17)).toBeNull();
  expect(mentionAt('@ada\nthanks', 11)).toBeNull();
  expect(mentionAt('a @ b', 5)).toBeNull();
  expect(mentionAt('no at sign', 4)).toBeNull();
});

test('a pick replaces the typed name with the token, the caret after it', () => {
  const text = 'Hi @gra, see this';
  const at = mentionAt(text, 7);
  if (!at) {
    throw new Error('expected a mention');
  }
  const done = insertMention(text, at, { id: 'u-2', name: 'Grace Hopper' });
  expect(done.text).toBe('Hi [@Grace Hopper](mention:u-2) , see this');
  const end = insertMention('@a b', { start: 0, query: 'a' }, { id: 'u-1', name: 'Ada' });
  expect(end.text).toBe('[@Ada](mention:u-1) b');
  expect(done.text.slice(0, done.caret)).toBe('Hi [@Grace Hopper](mention:u-2) ');
});
