import { expect, test } from 'bun:test';

import { jiraKeysIn } from './jira-keys';

const SITE = 'https://acme.atlassian.net';

test("the project's keys a pull request names, once each, in their order", () => {
  expect(
    jiraKeysIn(
      [
        'ABC-12 Dark mode',
        'feature/abc-13-dark-tokens',
        `Fixes ABC-14 (see ${SITE}/browse/ABC-15, and ABC-12 again).`,
      ],
      'ABC',
      SITE,
    ),
  ).toEqual(['ABC-12', 'ABC-13', 'ABC-14', 'ABC-15']);
});

test("other projects' keys, look-alikes and links of another site are left out", () => {
  expect(
    jiraKeysIn(
      [
        'UTF-8 and SHA-256 in XYZ-1',
        'https://other.atlassian.net/browse/ABC-16',
        `${SITE}/browse/XYZ-2`,
        'ABCD-3 and ABC-0',
      ],
      'ABC',
      SITE,
    ),
  ).toEqual([]);
});
