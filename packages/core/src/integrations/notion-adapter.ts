// Notion as a `TrackerAdapter`: its provider, pages by id or link, its markdown, discussions, properties and rules.

import { integrationKind } from './kinds';
import type { NotionApi } from './notion-api';
import { checkNotionField, notionFieldFailure, setNotionField } from './notion-fields';
import { readNotionItem } from './notion-item-read';
import { notionUrlsIn } from './notion-links';
import { notionProvider } from './notion-provider';
import { deliverNotionRule } from './notion-rule-send';
import { notionPostFailure, notionThreads, postNotionThreadComment } from './notion-threads';
import type { TrackerAdapter } from './tracker-adapter';
import { trackerRuleChecks } from './tracker-rules';

/** Notion allows about three requests a second. */
const NOTION_PER_TICK = 3;

/** The pages the texts link to, once each, in order. */
function pagesIn(texts: readonly string[]): string[] {
  return [...new Set(texts.flatMap((text) => notionUrlsIn(text).map((link) => link.id)))];
}

export function notionAdapter(notion: NotionApi): TrackerAdapter {
  const kind = integrationKind('notion');
  return {
    ...notionProvider(notion),
    kind: 'notion',
    refs: {
      parse: (input) => kind.parseRef(input),
      // A Notion link names no site: a page of another data source is refused when it is read.
      error: () => null,
      namedIn: (texts) => pagesIn(texts),
      check: async (secret, _config, pageId) => {
        const page = await notion.page(secret, pageId);
        return { itemId: page.id, title: page.title || 'Untitled Notion page', url: page.url };
      },
      url: (pageId) => `https://www.notion.so/${pageId.replaceAll('-', '')}`,
    },
    text: { markdown: (raw) => kind.cleanMarkdown(raw) },
    comments: {
      read: (token, _config, pageId) => notionThreads(notion, token, pageId),
      post: (token, _config, post) => postNotionThreadComment(notion, token, post),
      postFailure: notionPostFailure,
    },
    fields: {
      read: (access, pageId) => readNotionItem(notion, access, pageId),
      check: (access, pageId, input) => checkNotionField(notion, access, pageId, input),
      set: (access, change) => setNotionField(notion, access, change),
      setFailure: (error) => notionFieldFailure(error),
    },
    rules: {
      ...trackerRuleChecks('notion'),
      perTick: NOTION_PER_TICK,
      deliver: (access, run) => deliverNotionRule(notion, access, run),
    },
  };
}
