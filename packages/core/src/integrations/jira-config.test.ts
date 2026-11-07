import { expect, test } from 'bun:test';

import {
  jiraConfigOf,
  jiraRefSiteError,
  jiraSiteOf,
  parseJiraKey,
  readJiraConfig,
} from './jira-config';

test('a site is an atlassian.net origin, from a URL, a host, a page of it or the bare name', () => {
  expect(jiraSiteOf('https://acme.atlassian.net')).toBe('https://acme.atlassian.net');
  expect(jiraSiteOf(' Acme.Atlassian.net ')).toBe('https://acme.atlassian.net');
  expect(jiraSiteOf('https://acme.atlassian.net/jira/software/projects/ABC/boards/1')).toBe(
    'https://acme.atlassian.net',
  );
  expect(jiraSiteOf('acme')).toBe('https://acme.atlassian.net');
  expect(jiraSiteOf('my-team')).toBe('https://my-team.atlassian.net');
});

test('a site anywhere else is refused: the token is sent to it', () => {
  for (const site of [
    'http://acme.atlassian.net',
    'https://acme.atlassian.net:8443',
    'https://atlassian.net',
    'https://acme.atlassian.net.evil.example',
    'https://evil.example/acme.atlassian.net',
    'https://a.b.atlassian.net',
    'jira.acme.com',
    '',
  ]) {
    expect(jiraSiteOf(site)).toBeNull();
  }
});

test('an issue key from the key or a link', () => {
  expect(parseJiraKey('ABC-123')).toBe('ABC-123');
  expect(parseJiraKey(' abc-7 ')).toBe('ABC-7');
  expect(parseJiraKey('https://acme.atlassian.net/browse/ABC-123')).toBe('ABC-123');
  expect(parseJiraKey('https://acme.atlassian.net/browse/ABC-123?focusedCommentId=1')).toBe(
    'ABC-123',
  );
  expect(
    parseJiraKey(
      'https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ABC-9',
    ),
  ).toBe('ABC-9');
  for (const input of [
    'ABC',
    'ABC-0',
    '123',
    'ABC-12x',
    'https://acme.atlassian.net/browse/',
    '',
  ]) {
    expect(parseJiraKey(input)).toBeNull();
  }
});

test('a config from the browser is checked and normalized', () => {
  expect(
    readJiraConfig({ site: 'acme', email: ' ada@acme.com ', projectKey: 'abc', extra: 1 }),
  ).toEqual({
    config: { site: 'https://acme.atlassian.net', email: 'ada@acme.com', projectKey: 'ABC' },
  });
  expect(
    readJiraConfig({ site: 'jira.acme.com', email: 'a@b.c', projectKey: 'ABC' }),
  ).toHaveProperty('error');
  expect(readJiraConfig({ site: 'acme', email: 'ada', projectKey: 'ABC' })).toHaveProperty('error');
  expect(readJiraConfig({ site: 'acme', email: 'a@b.c', projectKey: 'ABC-1' })).toHaveProperty(
    'error',
  );
  expect(readJiraConfig(null)).toHaveProperty('error');
  expect(() => jiraConfigOf({ dataSourceId: 'x' })).toThrow('incomplete');
});

test('a pasted link must be on the configured site; a bare key always is', () => {
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  expect(jiraRefSiteError('ABC-1', config)).toBeNull();
  expect(jiraRefSiteError('https://acme.atlassian.net/browse/ABC-1', config)).toBeNull();
  expect(jiraRefSiteError('https://other.atlassian.net/browse/ABC-1', config)).toBe(
    "That link is not on the project's Jira site (https://acme.atlassian.net)",
  );
  expect(jiraRefSiteError('https://evil.example/browse/ABC-1', config)).not.toBeNull();
});
