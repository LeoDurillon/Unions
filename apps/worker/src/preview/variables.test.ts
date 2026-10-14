import { expect, test } from 'bun:test';

import type { Target } from './target';
import {
  configEnvironment,
  escapeDollars,
  runVariables,
  shownVariables,
  unmaskSecrets,
} from './variables';

/** `${DB_PASSWORD}`, spelled out: a placeholder written as is reads like a forgotten template. */
const REFERENCE = ['$', '{DB_PASSWORD}'].join('');
const OTHER_REFERENCE = ['$', '{OTHER}'].join('');

const TARGET = {
  plain: { API_URL: 'http://api:8080', PRICE: 'costs $5' },
  secrets: { DB_PASSWORD: 'pa$word' },
} as unknown as Target;

test('the file Docker runs holds every value, with $ escaped as compose expects', () => {
  expect(escapeDollars('a$b$$c')).toBe('a$$b$$$$c');
  expect(runVariables(TARGET)).toEqual({
    env: { API_URL: 'http://api:8080', PRICE: 'costs $$5', DB_PASSWORD: 'pa$$word' },
    content: 'API_URL=http://api:8080\nPRICE=costs $$5\nDB_PASSWORD=pa$$word\n',
  });
});

test('the file people read never holds a secret value, only a reference compose fills in', () => {
  const shown = shownVariables(TARGET);
  expect(shown.env.DB_PASSWORD).toBe(REFERENCE);
  expect(shown.content).not.toContain('pa$');
  expect(configEnvironment(TARGET, true).DB_PASSWORD).toBe(REFERENCE);
  expect(configEnvironment(TARGET, false).DB_PASSWORD).toBe('pa$word');
  expect(
    unmaskSecrets(`POSTGRES_PASSWORD: $${REFERENCE}\nX: $${OTHER_REFERENCE}`, ['DB_PASSWORD']),
  ).toBe(`POSTGRES_PASSWORD: ${REFERENCE}\nX: $${OTHER_REFERENCE}`);
});
