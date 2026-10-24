// The kinds of ticket source Union connects to (Notion), and what the UI needs to know about each; browser-safe.
import { parseNotionId } from '../notion-id';
import { notionMarkdown } from '../notion-markdown';

export type IntegrationKindName = 'notion';

/** What the UI and the routes need to know about a kind; no secret, no network. */
export type IntegrationKind = {
  kind: IntegrationKindName;
  /** The tracker's name: "Notion". */
  label: string;
  /** What one of its items is called: "page". */
  itemLabel: string;
  /** An item's id from a URL or a bare id; null when the input holds none. */
  parseRef(input: string): string | null;
  /** The tracker's markdown as plain GitHub-flavored markdown. */
  cleanMarkdown(markdown: string): string;
};

const KINDS: Record<IntegrationKindName, IntegrationKind> = {
  notion: {
    kind: 'notion',
    label: 'Notion',
    itemLabel: 'page',
    parseRef: parseNotionId,
    cleanMarkdown: (markdown) => notionMarkdown(markdown),
  },
};

export function integrationKind(kind: IntegrationKindName): IntegrationKind {
  return KINDS[kind];
}
