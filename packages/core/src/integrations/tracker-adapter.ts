// A tracker behind one interface (`TrackerAdapter`): its provider's calls, and the capabilities it has.
// Features ask for a capability (`adapter.refs`), never for a tracker by name; `IntegrationKind.capabilities`
// names them for the browser. See docs/plans/tracker-adapters.md.

import type { IntegrationKindName } from './kinds';
import type { IntegrationProvider } from './provider';
import type { TrackerCommentInput, TrackerThreads } from './tracker-comments';
import type { CheckedField, FieldChange, TrackerAccess, TrackerFieldInput } from './tracker-fields';
import type { TrackerFile } from './tracker-files';
import type { LinkedItem, TrackerItemFacts, TrackerItemText, TrackerMove } from './tracker-item';
import type { TrackerRules } from './tracker-rules';

/** Every capability an adapter may have, in the order `capabilitiesOf` lists them. */
const TRACKER_CAPABILITIES = ['refs', 'text', 'comments', 'fields', 'rules', 'files'] as const;

export type TrackerCapability = (typeof TRACKER_CAPABILITIES)[number];

/** How the tracker's items are named: their ids and links, pasted or in a text. */
type TrackerRefs = {
  /** An item's id from a link or a bare id; null when the input holds none. */
  parse(input: string): string | null;
  /** Why a pasted link cannot be an item of this integration (another site); null when it can. */
  error(input: string, config: unknown): string | null;
  /** The items the texts name (a pull request's title, branch, description), once each, in order. */
  namedIn(texts: readonly string[], config: unknown): string[];
  /**
   * The item `itemId` names, read to link it: a Notion page shared with the integration, a Jira issue
   * of the project's Jira project, or with `anywhere` (a review's) any the account sees. Throws when the
   * tracker does not give it.
   */
  check(secret: string, config: unknown, itemId: string, anywhere?: boolean): Promise<LinkedItem>;
  /** The item's address in the tracker, when Union did not keep the one it was given. */
  url(itemId: string, config: unknown): string;
};

/** The tracker's text. */
type TrackerText = {
  /** The tracker's markdown, as a ticket imported from it stores it, as plain GitHub-flavored markdown. */
  markdown(raw: string): string;
  /** The item's text as markdown, read now; `truncated` when the tracker cut a long one short. */
  read(secret: string, config: unknown, itemId: string): Promise<TrackerItemText>;
};

/** An item's comments: read as threads, and one posted (a reply as the kind's `commentReplies` says). */
type TrackerComments = {
  /** The item's threads; throws `TrackerRefusedError` (`tracker-refused.ts`) when the integration may not read comments. */
  read(secret: string, config: unknown, itemId: string): Promise<TrackerThreads>;
  post(secret: string, config: unknown, post: TrackerCommentInput): Promise<{ commentId: string }>;
  /** Why the tracker refused a post, the permission named when it lacks one; `inThread`: it was a reply. */
  postFailure(error: unknown, inThread: boolean): string;
};

/** An item's properties set by hand: checked against the item read now, then sent by the worker. */
type TrackerFields = {
  /** The item as its card shows it, read now; null when the tracker does not give it. */
  read(access: TrackerAccess, itemId: string): Promise<TrackerItemFacts | null>;
  /** The moves the item offers now, for a status of the shared type `move` (Jira's transitions). */
  moves?(access: TrackerAccess, itemId: string): Promise<TrackerMove[]>;
  /** The change as the command keeps it; throws `TrackerValueError` (`tracker-value-error.ts`) when refused. */
  check(access: TrackerAccess, itemId: string, input: TrackerFieldInput): Promise<CheckedField>;
  set(access: TrackerAccess, change: FieldChange): Promise<void>;
  /** Why the tracker refused the change, the permission named when it lacks one. */
  setFailure(error: unknown, fieldId: string): string;
};

/** An item's images and files, downloaded to be kept as a new ticket's (`tracker-files.ts`). */
type TrackerFiles = {
  /**
   * The text with the files it links that were kept named `attachment:<name>`, and those files.
   * Without `access` (no integration), a tracker whose files need its credentials keeps the links.
   */
  fetch(
    markdown: string,
    access: TrackerAccess | null,
    fetchFn?: typeof fetch,
  ): Promise<{ markdown: string; files: TrackerFile[] }>;
};

/** One tracker: the provider's calls, its kind, and each capability it has. */
export type TrackerAdapter = IntegrationProvider & {
  kind: IntegrationKindName;
  refs?: TrackerRefs;
  text?: TrackerText;
  comments?: TrackerComments;
  fields?: TrackerFields;
  /** The rule actions its kind's `ruleActions` names: checked, previewed and sent (`tracker-rules.ts`). */
  rules?: TrackerRules;
  files?: TrackerFiles;
};

/** The capabilities the adapter has, in `TRACKER_CAPABILITIES`'s order. */
export function capabilitiesOf(adapter: TrackerAdapter): TrackerCapability[] {
  return TRACKER_CAPABILITIES.filter((name) => adapter[name] !== undefined);
}
