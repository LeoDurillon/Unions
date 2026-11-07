// The kinds of ticket source Union connects to (Notion, Jira), and what the UI needs to know about each; browser-safe.
import { parseNotionId } from '../notion-id';
import { notionMarkdown } from '../notion-markdown';
import { parseJiraKey, readJiraConfig } from './jira-config';

export type IntegrationKindName = 'notion' | 'jira';

/** What the UI and the routes need to know about a kind; no secret, no network. */
export type IntegrationKind = {
  kind: IntegrationKindName;
  /** The tracker's name: "Notion". */
  label: string;
  /** What one of its items is called: "page". */
  itemLabel: string;
  /** What its items come from: "data source". */
  sourceLabel: string;
  /** An item's id from a URL or a bare id; null when the input holds none. */
  parseRef(input: string): string | null;
  /** The tracker's markdown as plain GitHub-flavored markdown. */
  cleanMarkdown(markdown: string): string;
  /** A config as sent by the browser, checked and normalized; or what is wrong with it. */
  readConfig(input: unknown): { config: Record<string, unknown> } | { error: string };
};

/** Notion's config: the data source, from its ID or URL. */
function readNotionConfig(input: unknown): { config: Record<string, unknown> } | { error: string } {
  const value =
    typeof input === 'object' && input !== null && 'dataSourceId' in input
      ? input.dataSourceId
      : undefined;
  const dataSourceId = typeof value === 'string' ? parseNotionId(value) : null;
  return dataSourceId
    ? { config: { dataSourceId } }
    : { error: 'That is not a Notion data source ID or URL' };
}

const KINDS: Record<IntegrationKindName, IntegrationKind> = {
  notion: {
    kind: 'notion',
    label: 'Notion',
    itemLabel: 'page',
    sourceLabel: 'data source',
    parseRef: parseNotionId,
    cleanMarkdown: (markdown) => notionMarkdown(markdown),
    readConfig: readNotionConfig,
  },
  jira: {
    kind: 'jira',
    label: 'Jira',
    itemLabel: 'issue',
    sourceLabel: 'project',
    parseRef: parseJiraKey,
    // The provider converts an issue's ADF to markdown already.
    cleanMarkdown: (markdown) => markdown,
    readConfig: readJiraConfig,
  },
};

export function isIntegrationKindName(value: string): value is IntegrationKindName {
  return Object.hasOwn(KINDS, value);
}

export function integrationKind(kind: IntegrationKindName): IntegrationKind {
  return KINDS[kind];
}
