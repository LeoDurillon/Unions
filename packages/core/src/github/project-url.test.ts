import { expect, test } from 'bun:test';

import { parseProjectUrl } from './project-url';

test('parses org and user project urls, with views and trailing slashes', () => {
  expect(parseProjectUrl('https://github.com/orgs/acme/projects/3')).toEqual({
    kind: 'orgs',
    login: 'acme',
    number: 3,
  });
  expect(parseProjectUrl(' https://github.com/users/jo-d/projects/12/views/1?x=1 ')).toEqual({
    kind: 'users',
    login: 'jo-d',
    number: 12,
  });
});

test('rejects anything else', () => {
  expect(parseProjectUrl('https://github.com/acme/repo')).toBeNull();
  expect(parseProjectUrl('https://example.com/orgs/acme/projects/3')).toBeNull();
  expect(parseProjectUrl('PVT_kwDOabc')).toBeNull();
});
