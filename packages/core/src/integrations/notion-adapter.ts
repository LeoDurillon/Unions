// Notion as a `TrackerAdapter`: its provider, pages by id or link, its markdown, discussions, properties and rules.

import type { NotionApi } from './notion-api';
import { checkNotionField, notionFieldFailure, setNotionField } from './notion-fields';
import { fetchNotionFiles } from './notion-files';
import { notionText, readNotionItem } from './notion-item-read';
import { notionProvider } from './notion-provider';
import { notionRefs } from './notion-refs';
import { deliverNotionRule } from './notion-rule-send';
import { notionComments } from './notion-threads';
import type { TrackerAdapter } from './tracker-adapter';
import { trackerRuleChecks } from './tracker-rules';

/** Notion allows about three requests a second. */
const NOTION_PER_TICK = 3;

export function notionAdapter(notion: NotionApi): TrackerAdapter {
  return {
    ...notionProvider(notion),
    kind: 'notion',
    refs: notionRefs(notion),
    text: notionText(notion),
    comments: notionComments(notion),
    fields: {
      read: (access, pageId) => readNotionItem(notion, access, pageId),
      check: (access, pageId, input) => checkNotionField(notion, access, pageId, input),
      set: (access, change) => setNotionField(notion, access, change),
      setFailure: (error) => notionFieldFailure(error),
    },
    files: { fetch: (markdown, _access, fetchFn) => fetchNotionFiles(markdown, fetchFn) },
    rules: {
      ...trackerRuleChecks('notion'),
      perTick: NOTION_PER_TICK,
      deliver: (access, run) => deliverNotionRule(notion, access, run),
    },
  };
}
