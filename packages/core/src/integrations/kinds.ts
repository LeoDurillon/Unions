// The kinds of ticket source Union connects to (Notion, Jira), and what the UI needs to know about each; browser-safe.

import { jiraRefSiteError, parseJiraKey, readJiraConfig } from './jira-config';
import { jiraFieldShape } from './jira-field-shapes';
import { notionFieldShape } from './notion-field-shapes';
import { parseNotionId } from './notion-id';
import { notionMarkdown } from './notion-markdown';
import type { TrackerActionKind } from './tracker-action-kinds';
import type { TrackerCapability } from './tracker-adapter';
import type { TrackerFieldShape } from './tracker-field-types';

/** Every kind of tracker, in the order the UI lists them. */
export const INTEGRATION_KIND_NAMES = ['notion', 'jira'] as const;

export type IntegrationKindName = (typeof INTEGRATION_KIND_NAMES)[number];

/** What the UI and the routes need to know about a kind; no secret, no network. */
export type IntegrationKind = {
  kind: IntegrationKindName;
  /** The tracker's name: "Notion". */
  label: string;
  /** What one of its items is called: "page". */
  itemLabel: string;
  /** What its items come from: "data source". */
  sourceLabel: string;
  /** Its items are named by a key (`ABC-12`) rather than a title alone. */
  namedByKey: boolean;
  /** The field linking an item to a ticket: its name for screen readers, and what to paste. */
  linkPrompt: { label: string; placeholder: string };
  /** How the Overview counts the item's comments: its threads or all its comments, and their name. */
  commentCount: { counts: 'threads' | 'total'; one: string; many: string };
  /** How an item's card says it last changed: "edited 2 h ago". */
  changedLabel: string;
  /** What its items' fields are called, in the plural: "properties". */
  fieldsLabel: string;
  /** An item's id from a URL or a bare id; null when the input holds none. */
  parseRef(input: string): string | null;
  /** Why a pasted link cannot be an item of this integration (another site); null when it can. */
  refError?(input: string, config: unknown): string | null;
  /** Whether Union can add an item to the source (a ticket written from an investigation). */
  createsItems: boolean;
  /** What the kind's adapter can do, so the browser shows only what it supports. */
  capabilities: readonly TrackerCapability[];
  /** How a field of the tracker's `type` takes its value, as a shared type; null when Union cannot set it. */
  fieldShape(type: string): TrackerFieldShape | null;
  /** The rule actions it takes, in the order the rule editor offers them. */
  ruleActions: readonly TrackerActionKind[];
  /** How a reply answers a comment: in its thread, or as a new comment that mentions its author. */
  commentReplies: 'thread' | 'mention';
  /** Under the comment box: what the text may hold and whose name it is posted under. */
  commentsPostAs: string;
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
    fieldsLabel: 'properties',
    changedLabel: 'edited',
    namedByKey: false,
    linkPrompt: { label: 'Notion page URL', placeholder: 'Link a Notion page: its URL or ID' },
    commentCount: { counts: 'threads', one: 'open discussion', many: 'open discussions' },
    parseRef: parseNotionId,
    cleanMarkdown: (markdown) => notionMarkdown(markdown),
    readConfig: readNotionConfig,
    createsItems: true,
    capabilities: ['refs', 'text', 'comments', 'fields', 'rules', 'files'],
    fieldShape: notionFieldShape,
    ruleActions: ['tracker_fields'],
    commentReplies: 'thread',
    commentsPostAs: 'Posts under the Notion integration’s name',
  },
  jira: {
    kind: 'jira',
    label: 'Jira',
    itemLabel: 'issue',
    sourceLabel: 'project',
    fieldsLabel: 'fields',
    changedLabel: 'updated',
    namedByKey: true,
    linkPrompt: {
      label: 'Jira issue key or link',
      placeholder: 'Link a Jira issue: its key (ABC-12) or link',
    },
    commentCount: { counts: 'total', one: 'comment', many: 'comments' },
    parseRef: parseJiraKey,
    // The provider converts an issue's ADF to markdown already.
    cleanMarkdown: (markdown) => markdown,
    readConfig: readJiraConfig,
    refError: jiraRefSiteError,
    createsItems: true,
    capabilities: ['refs', 'text', 'comments', 'fields', 'rules', 'files'],
    fieldShape: jiraFieldShape,
    ruleActions: ['tracker_status', 'tracker_fields', 'tracker_comment'],
    commentReplies: 'mention',
    commentsPostAs:
      'Markdown: **bold**, `code`, [links](https://…), lists. Posts as the Atlassian account of the Jira connection, visible to everyone who can see the issue',
  },
};

export function isIntegrationKindName(value: string): value is IntegrationKindName {
  return Object.hasOwn(KINDS, value);
}

/** One value per kind, made by `make`. */
export function byKind<T>(make: (kind: IntegrationKindName) => T): Record<IntegrationKindName, T> {
  return { notion: make('notion'), jira: make('jira') };
}

/** Every kind, in the order the UI lists them. */
export function integrationKinds(): IntegrationKind[] {
  return Object.values(KINDS);
}

export function integrationKind(kind: IntegrationKindName): IntegrationKind {
  return KINDS[kind];
}
