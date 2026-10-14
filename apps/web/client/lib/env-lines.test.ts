import { expect, test } from 'bun:test';

import { envLines, parseEnvLines } from './env-lines';

test('KEY=value lines round-trip; comments and blank lines are skipped', () => {
  const text = '# comment\nAPI_URL=http://api:8080\n\nTOKEN=a=b\nnot a variable';
  expect(parseEnvLines(text)).toEqual({ API_URL: 'http://api:8080', TOKEN: 'a=b' });
  expect(envLines({ A: '1', B: '' })).toBe('A=1\nB=');
});
