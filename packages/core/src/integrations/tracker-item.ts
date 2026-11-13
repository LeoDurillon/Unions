// A tracker item as its card shows it (title, key, type, status, assignee, last change, properties); browser-safe.
// Each adapter reads its own (`fields.read`); a status move is one of the moves the item offers (`fields.moves`).

import type { TrackerProperty } from './tracker-property';

/** Where a status stands in its workflow, for its colour: not started, under way, done. */
export type TrackerStage = 'new' | 'indeterminate' | 'done';

export type TrackerItemFacts = {
  title: string;
  /** The item's key where the tracker names items by one (`ABC-1`); null otherwise. */
  key: string | null;
  /** Its type (`Story`); null when the tracker has none. */
  type: string | null;
  /** Its status: the column holding it when the tracker has several (Notion), its stage when known (Jira). */
  status: { field: string | null; name: string; stage: TrackerStage | null } | null;
  /** Who it is assigned to (null: nobody); absent when the tracker does not assign items. */
  assignee?: string | null;
  /** When it last changed, as the tracker says. */
  changedAt: string | null;
  properties: TrackerProperty[];
};

/** An item found for linking: its id (a page id, an issue key), its title and its address. */
export type LinkedItem = { itemId: string; title: string; url: string };

/** A move the item's workflow offers now: its id, its name, the status it leads to. */
export type TrackerMove = { id: string; name: string; toName: string };
