// Tests for resolving the blocks Notion's page markdown leaves as `<unknown>`.
import { expect, test } from 'bun:test';

import { notionMarkdown } from './notion-markdown';
import {
  blockLinkOf,
  resolveUnknownBlocks,
  unknownBlockIds,
  withBlockLinks,
} from './notion-unknown-blocks';

const BLOCK = '40d719182945802f91efffb5fbb10c8c';
const BLOCK_URL = `https://app.notion.com/p/40671918294580d3af55f9724ec58e73#${BLOCK}`;
const TAG = `<unknown url="${BLOCK_URL}" alt="external_object_instance"/>`;
const FIGMA =
  'https://www.figma.com/design/sn0ilfxTyyR4zEB2YEa0uQ/Eligibilit%C3%A9s-au-pr%C3%AAts?node-id=4001-8&t=ZF8MjibwikhSQJGE-1';
const MARKDOWN = ['# ❓Contexte', TAG, 'Dans l’onglet Administration, prêts :'].join('\n');
const PREVIEW_BLOCK = { object: 'block', type: 'link_preview', link_preview: { url: FIGMA } };

test('the unrendered blocks of a markdown, once each', () => {
  expect(unknownBlockIds(`${MARKDOWN}\n${TAG}`)).toEqual([BLOCK]);
  expect(unknownBlockIds('# nothing to read')).toEqual([]);
});

test('a block gives the link it shows, whatever kind of link block it is', () => {
  expect(blockLinkOf(PREVIEW_BLOCK)).toBe(FIGMA);
  expect(blockLinkOf({ type: 'embed', embed: { url: FIGMA } })).toBe(FIGMA);
  expect(blockLinkOf({ type: 'video', video: { external: { url: FIGMA } } })).toBe(FIGMA);
  expect(blockLinkOf({ type: 'paragraph', paragraph: { rich_text: [] } })).toBeNull();
  expect(blockLinkOf(null)).toBeNull();
});

test('a connected Figma preview is read through the block API and becomes its link', async () => {
  const read: string[] = [];
  const resolved = await resolveUnknownBlocks(MARKDOWN, (id) => {
    read.push(id);
    return Promise.resolve(PREVIEW_BLOCK);
  });
  expect(read).toEqual([BLOCK]);
  expect(resolved).toBe(
    ['# ❓Contexte', FIGMA, 'Dans l’onglet Administration, prêts :'].join('\n'),
  );
});

test('a block that cannot be read keeps a link to it in Notion, never the raw tag', async () => {
  const resolved = await resolveUnknownBlocks(MARKDOWN, () => Promise.reject(new Error('404')));
  expect(resolved).toContain(`[Notion block](${BLOCK_URL})`);
  expect(resolved).not.toContain('<unknown');
});

test('the cleaning of stored markdown turns a leftover tag into a link, and stays idempotent', () => {
  const cleaned = notionMarkdown(MARKDOWN);
  expect(cleaned.split('\n')[1]).toBe(`[Notion block](${BLOCK_URL})`);
  expect(notionMarkdown(cleaned)).toBe(cleaned);
  expect(withBlockLinks(FIGMA)).toBe(FIGMA);
});
