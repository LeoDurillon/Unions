import { adapterContract } from './adapter-contract';
import { fakeJiraApi } from './fake-jira-api';
import { jiraAdapter } from './jira-adapter';

const SITE = 'https://acme.atlassian.net';

const updates: { key: string; change: unknown }[] = [];
/** `GET /issue/ABC-1` with its edit screen: the due date can be set. */
const ISSUE_BODY = {
  fields: { summary: 'Add dark mode', status: { name: 'To Do' }, duedate: null },
  editmeta: { fields: { duedate: { name: 'Due date', schema: { type: 'date' } } } },
};

const PARAGRAPH = { type: 'paragraph', content: [{ type: 'text', text: 'Which shade?' }] };

const jira = fakeJiraApi(
  { key: 'ABC', name: 'Apollo', site: SITE },
  [
    {
      key: 'ABC-1',
      summary: 'Add dark mode',
      projectKey: 'ABC',
      description: null,
      attachments: [],
    },
    { key: 'XYZ-2', summary: 'Elsewhere', projectKey: 'XYZ', description: null, attachments: [] },
  ],
  {
    bodies: { 'ABC-1': ISSUE_BODY },
    updates,
    comments: {
      'ABC-1': [
        {
          id: '10001',
          author: { displayName: 'Ada', accountId: '557058:ada' },
          created: '2026-01-01T00:00:00.000+0000',
          body: { type: 'doc', version: 1, content: [PARAGRAPH] },
        },
      ],
    },
  },
);

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
  commented: 'ABC-1',
  fields: {
    itemId: 'ABC-1',
    field: { id: 'duedate', value: '2026-12-01' },
    sent: () => updates.length,
  },
});
