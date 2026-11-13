// Notion's `refs` capability: pages by id or link, those a text links to, a page read to link it.

import { integrationKind } from './kinds';
import type { NotionApi } from './notion-api';
import { notionUrlsIn } from './notion-links';
import type { TrackerAdapter } from './tracker-adapter';

/** The pages the texts link to, once each, in order. */
function pagesIn(texts: readonly string[]): string[] {
  return [...new Set(texts.flatMap((text) => notionUrlsIn(text).map((link) => link.id)))];
}

export function notionRefs(notion: NotionApi): NonNullable<TrackerAdapter['refs']> {
  const kind = integrationKind('notion');
  return {
    parse: (input) => kind.parseRef(input),
    // A Notion link names no site: a page of another data source is refused when it is read.
    error: () => null,
    namedIn: (texts) => pagesIn(texts),
    check: async (secret, _config, pageId) => {
      const page = await notion.page(secret, pageId);
      return { itemId: page.id, title: page.title || 'Untitled Notion page', url: page.url };
    },
    url: (pageId) => `https://www.notion.so/${pageId.replaceAll('-', '')}`,
  };
}
