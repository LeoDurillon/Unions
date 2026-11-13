import { expect, test } from 'bun:test';

import { matchingPeople, MENTION_TOKEN, mentionsAsText, mentionToken } from './tracker-mention';

const ada = { id: 'u-1', name: 'Ada Lovelace' };
const zoe = { id: 'u-2', name: 'Zoé Durand' };

test('a token names the person and carries their id', () => {
  expect(mentionToken(ada)).toBe('[@Ada Lovelace](mention:u-1)');
  expect(mentionToken({ id: '557058:abc', name: 'Grace [ops]' })).toBe(
    '[@Grace ops](mention:557058:abc)',
  );
  expect(mentionToken({ id: 'u-3', name: '[]' })).toBe('[@u-3](mention:u-3)');
});

test('the token is read back with its name and id', () => {
  const [match] = `Hi ${mentionToken(ada)}!`.matchAll(MENTION_TOKEN);
  expect(match?.groups).toEqual({ name: 'Ada Lovelace', id: 'u-1' });
});

test('tokens show as the bold name', () => {
  expect(
    mentionsAsText(`${mentionToken(ada)} and ${mentionToken(zoe)}, see [docs](https://x.y)`),
  ).toBe('**@Ada Lovelace** and **@Zoé Durand**, see [docs](https://x.y)');
});

test('people match on the start of any word, case and accents ignored', () => {
  const people = [ada, zoe];
  expect(matchingPeople(people, 'love', 5)).toEqual([ada]);
  expect(matchingPeople(people, 'zoe', 5)).toEqual([zoe]);
  expect(matchingPeople(people, 'ove', 5)).toEqual([]);
  expect(matchingPeople(people, '', 1)).toEqual([ada]);
});
