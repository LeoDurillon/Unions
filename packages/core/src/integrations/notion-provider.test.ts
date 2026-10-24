import { expect, test } from 'bun:test';

import type { NotionApi, NotionPage } from '../notion-api';
import { NotionError } from '../notion-error';
import { integrationKind, isIntegrationKindName } from './kinds';
import { notionProvider } from './notion-provider';
import { ItemOutsideSourceError } from './provider';

const SOURCE = '11111111-2222-4333-8444-555555555555';
const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const MENTIONED = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FOREIGN = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CONFIG = { dataSourceId: SOURCE };

function pageOf(id: string): NotionPage {
  const titles: Record<string, string> = { [PAGE]: 'Add dark mode', [MENTIONED]: 'Theme tokens' };
  return {
    id,
    title: titles[id] ?? 'Elsewhere',
    url: `https://www.notion.so/${id.replaceAll('-', '')}`,
    // Notion may answer without dashes: the provider compares ids either way.
    dataSourceId:
      id === FOREIGN ? '99999999-2222-4333-8444-555555555555' : SOURCE.replaceAll('-', ''),
  };
}

const created: { dataSourceId: string; title: string }[] = [];

const notion: NotionApi = {
  dataSourceTitle: (_token, id) =>
    id === SOURCE ? Promise.resolve('Roadmap') : Promise.reject(new NotionError('Not found', 404)),
  dataSource: () =>
    Promise.resolve({
      title: 'Roadmap',
      properties: [{ id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'Done'] }],
    }),
  page: (_token, id) => Promise.resolve(pageOf(id)),
  pageMarkdown: () =>
    Promise.resolve({
      markdown: `## Goal\n\nSee <mention-page url="https://www.notion.so/${MENTIONED.replaceAll('-', '')}"/>.\n`,
      truncated: true,
    }),
  users: () => Promise.resolve([]),
  updatePage: () => Promise.resolve(),
  createPage: (_token, dataSourceId, page) => {
    created.push({ dataSourceId, title: page.title });
    return Promise.resolve({ ...pageOf(PAGE), title: page.title });
  },
};

const provider = notionProvider(notion);

test('verify reads the data source title, and passes on Notion errors', async () => {
  expect(await provider.verify('secret', CONFIG)).toEqual({ title: 'Roadmap' });
  const missing = provider.verify('secret', { dataSourceId: PAGE });
  expect(missing).rejects.toBeInstanceOf(NotionError);
});

test('a config without a data source is refused before any call', () => {
  expect(provider.verify('secret', {})).rejects.toThrow('no data source');
  expect(provider.readFields('secret', null)).rejects.toThrow('no data source');
});

test('readFields returns the data source columns', async () => {
  expect(await provider.readFields('secret', CONFIG)).toEqual({
    title: 'Roadmap',
    fields: {
      title: 'Roadmap',
      properties: [{ id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'Done'] }],
    },
  });
});

test('item reads a page of the data source as clean markdown, mentions titled', async () => {
  const item = await provider.item('secret', CONFIG, PAGE);
  expect(item).toMatchObject({ id: PAGE, title: 'Add dark mode', truncated: true });
  expect(item.url).toBe(`https://www.notion.so/${PAGE.replaceAll('-', '')}`);
  expect(item.markdown).toStartWith('## Goal');
  expect(item.markdown).toContain('[Theme tokens](');
  expect(item.markdown).not.toContain('<mention-page');
});

test('item refuses a page of another data source', () => {
  expect(provider.item('secret', CONFIG, FOREIGN)).rejects.toBeInstanceOf(ItemOutsideSourceError);
});

test('createItem adds a page to the configured data source', async () => {
  const item = await provider.createItem?.('secret', CONFIG, { title: 'New', markdown: 'Body' });
  expect(created).toEqual([{ dataSourceId: SOURCE, title: 'New' }]);
  expect(item).toMatchObject({ title: 'New', markdown: 'Body', truncated: false });
});

test('the Notion kind parses page URLs and cleans markdown', () => {
  const kind = integrationKind('notion');
  expect(kind).toMatchObject({ label: 'Notion', itemLabel: 'page' });
  expect(kind.parseRef(`https://www.notion.so/Add-dark-mode-${PAGE.replaceAll('-', '')}`)).toBe(
    PAGE,
  );
  expect(kind.parseRef('not an id')).toBeNull();
  expect(
    kind.readConfig({ dataSourceId: `https://www.notion.so/x/${PAGE.replaceAll('-', '')}` }),
  ).toEqual({
    config: { dataSourceId: PAGE },
  });
  expect(kind.readConfig({ dataSourceId: 'nope' })).toHaveProperty('error');
  expect(kind.readConfig(null)).toHaveProperty('error');
  expect(isIntegrationKindName('notion')).toBe(true);
  expect(isIntegrationKindName('toString')).toBe(false);
  expect(kind.cleanMarkdown('<callout>\n\tNote\n</callout>')).not.toContain('<callout');
});
