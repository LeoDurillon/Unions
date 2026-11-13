import { adapterContract } from './adapter-contract';
import { fakeJiraApi } from './fake-jira-api';
import { jiraAdapter } from './jira-adapter';

const SITE = 'https://acme.atlassian.net';

const jira = fakeJiraApi({ key: 'ABC', name: 'Apollo' }, [
  { key: 'ABC-1', summary: 'Add dark mode', projectKey: 'ABC', description: null, attachments: [] },
  { key: 'XYZ-2', summary: 'Elsewhere', projectKey: 'XYZ', description: null, attachments: [] },
]);

adapterContract({
  adapter: jiraAdapter(jira),
  secret: 'token',
  config: { site: SITE, email: 'ada@acme.com', projectKey: 'ABC' },
  item: { id: 'ABC-1', link: `${SITE}/browse/ABC-1`, title: 'Add dark mode' },
  outside: 'XYZ-2',
  otherSite: 'https://other.atlassian.net/browse/ABC-1',
  named: {
    texts: [
      'ABC-7: add dark mode (UTF-8 safe)',
      'abc-3-dark-mode',
      `See ${SITE}/browse/ABC-1, https://other.atlassian.net/browse/ABC-9 and XYZ-4. Again ABC-7.`,
    ],
    ids: ['ABC-7', 'ABC-3', 'ABC-1'],
  },
  markdown: { raw: '## Goal\n\nMake it **fast**', clean: '## Goal\n\nMake it **fast**' },
});
