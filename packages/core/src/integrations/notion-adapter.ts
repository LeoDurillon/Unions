// Notion as a `TrackerAdapter`: its provider, pages named by id or link, its markdown cleaned.

import { integrationKind } from './kinds';
import type { NotionApi } from './notion-api';
import { notionUrlsIn } from './notion-links';
import { notionProvider } from './notion-provider';
import type { TrackerAdapter } from './tracker-adapter';

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
    },
    text: { markdown: (raw) => kind.cleanMarkdown(raw) },
  };
}
