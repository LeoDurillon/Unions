// A tracker behind one interface (`TrackerAdapter`): its provider's calls, and the capabilities it has.
// Features ask for a capability (`adapter.refs`), never for a tracker by name; `IntegrationKind.capabilities`
// names them for the browser. See docs/plans/tracker-adapters.md.

import type { IntegrationKindName } from './kinds';
import type { IntegrationProvider } from './provider';

/** Every capability an adapter may have, in the order `capabilitiesOf` lists them. */
const TRACKER_CAPABILITIES = ['refs', 'text'] as const;

export type TrackerCapability = (typeof TRACKER_CAPABILITIES)[number];

/** How the tracker's items are named: their ids and links, pasted or in a text. */
type TrackerRefs = {
  /** An item's id from a link or a bare id; null when the input holds none. */
  parse(input: string): string | null;
  /** Why a pasted link cannot be an item of this integration (another site); null when it can. */
  error(input: string, config: unknown): string | null;
  /** The items the texts name (a pull request's title, branch, description), once each, in order. */
  namedIn(texts: readonly string[], config: unknown): string[];
};

/** The tracker's text. */
type TrackerText = {
  /** The tracker's markdown, as a ticket imported from it stores it, as plain GitHub-flavored markdown. */
  markdown(raw: string): string;
};

/** One tracker: the provider's calls, its kind, and each capability it has. */
export type TrackerAdapter = IntegrationProvider & {
  kind: IntegrationKindName;
  refs?: TrackerRefs;
  text?: TrackerText;
};

/** The capabilities the adapter has, in `TRACKER_CAPABILITIES`'s order. */
export function capabilitiesOf(adapter: TrackerAdapter): TrackerCapability[] {
  return TRACKER_CAPABILITIES.filter((name) => adapter[name] !== undefined);
}
