import { adapterContract } from './adapter-contract';
import { fakeNotionApi } from './fake-notion-api';
import { notionAdapter } from './notion-adapter';

const SOURCE = '11111111-2222-4333-8444-555555555555';
const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FOREIGN = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const hex = (id: string): string => id.replaceAll('-', '');

const updates: { pageId: string; properties: Record<string, unknown> }[] = [];
const NOTES = {
  id: 'n%3A1',
  name: 'Notes',
  type: 'rich_text',
  text: '',
  value: '',
  options: [],
  settable: true,
};

const notion = fakeNotionApi(
  { id: SOURCE, title: 'Roadmap' },
  [
    {
      id: PAGE,
      title: 'Add dark mode',
      dataSourceId: SOURCE,
      markdown: '## Goal\n',
      properties: [NOTES],
      comments: [
        {
          id: 'c-1',
          discussionId: 'd-1',
          blockId: null,
          author: 'Ada',
          createdAt: '2026-01-01T00:00:00.000Z',
          richText: [
            {
              text: 'Which shade?',
              href: null,
              bold: false,
              italic: false,
              strikethrough: false,
              code: false,
            },
          ],
        },
      ],
    },
    { id: OTHER, title: 'Theme tokens', dataSourceId: SOURCE, markdown: '' },
    {
      id: FOREIGN,
      title: 'Elsewhere',
      dataSourceId: '99999999-2222-4333-8444-555555555555',
      markdown: '',
    },
  ],
  updates,
);

adapterContract({
  adapter: notionAdapter(notion),
  secret: 'secret',
  config: { dataSourceId: SOURCE },
  item: {
    id: PAGE,
    link: `https://www.notion.so/acme/Add-dark-mode-${hex(PAGE)}`,
    title: 'Add dark mode',
  },
  outside: FOREIGN,
  otherSite: null,
  named: {
    texts: [
      'Add dark mode',
      'dark-mode',
      `Spec: https://www.notion.so/${hex(OTHER)}, and https://app.notion.com/p/${hex(PAGE)}.\n` +
        `Again https://www.notion.so/${hex(OTHER)} and https://example.com/${hex(FOREIGN)}`,
    ],
    ids: [OTHER, PAGE],
  },
  markdown: {
    raw: `See <mention-page url="https://www.notion.so/${hex(OTHER)}"/>`,
    clean: `See [Notion page](https://www.notion.so/${hex(OTHER)})`,
  },
  commented: PAGE,
  fields: { itemId: PAGE, field: { id: NOTES.id, value: 'Shipped' }, sent: () => updates.length },
});
