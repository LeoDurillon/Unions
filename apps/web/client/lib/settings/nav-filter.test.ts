import { expect, test } from 'bun:test';

import { filterNav } from './nav-filter';

const GROUPS = [
  {
    label: 'Project',
    sections: [
      { id: 'general', label: 'General' },
      { id: 'files', label: 'Files' },
    ],
  },
  {
    label: 'Integrations',
    sections: [
      { id: 'notion', label: 'Notion' },
      { id: 'jira', label: 'Jira' },
    ],
  },
  { label: null, sections: [{ id: 'danger', label: 'Danger zone' }] },
];

test('a page matches by its name or its group name, every word', () => {
  expect(filterNav(GROUPS, 'jir').map((group) => group.sections.map((entry) => entry.id))).toEqual([
    ['jira'],
  ]);
  expect(
    filterNav(GROUPS, 'integrations').flatMap((group) => group.sections.map((entry) => entry.id)),
  ).toEqual(['notion', 'jira']);
  expect(filterNav(GROUPS, 'danger zone')).toHaveLength(1);
  expect(filterNav(GROUPS, '  ')).toHaveLength(GROUPS.length);
});
