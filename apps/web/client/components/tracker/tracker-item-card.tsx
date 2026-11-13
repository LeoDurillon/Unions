// The card at the top of a tracker tab (Notion page, Jira issue): its mark, what it says, Open, Refresh.
// Then the item's properties, once read.

import type { TrackerProperty } from '@union/core';
import type { ReactElement, ReactNode } from 'react';

import { Bone } from '../ui/skeleton';
import { Button, CARD_CLASS } from '../ui/ui';
import { TrackerProperties } from './tracker-properties';
import type { TrackerPropertyEditing } from './tracker-property-row';

export function TrackerItemCard({
  mark,
  loaded,
  open,
  reading,
  onRefresh,
  properties,
  editing = null,
  children,
}: {
  /** One letter for the tracker, in a tile. */
  mark: string;
  /** The tracker answered (the item read or not); before, the heading's shapes. */
  loaded: boolean;
  open: { url: string; label: string } | null;
  reading: boolean;
  onRefresh: () => void;
  /** The item's properties as read; none before. */
  properties: TrackerProperty[];
  /** What editing the properties needs; none: read only. */
  editing?: TrackerPropertyEditing | null;
  /** The heading: a title line, then a line of facts. */
  children: ReactNode;
}): ReactElement {
  return (
    <>
      <div className={`${CARD_CLASS} flex items-center gap-3 space-y-0`}>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-800"
        >
          {mark}
        </span>
        <div className="min-w-0 flex-1">
          {loaded ? (
            children
          ) : (
            <div className="space-y-1.5">
              <Bone className="h-3.5" width="45%" />
              <Bone className="h-2.5" width="30%" />
            </div>
          )}
        </div>
        {open ? (
          <a
            href={open.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {open.label} ↗
          </a>
        ) : null}
        <Button className="shrink-0" disabled={reading} onClick={onRefresh}>
          {reading ? 'Reading…' : 'Refresh'}
        </Button>
      </div>
      <TrackerProperties properties={properties} editing={editing} />
    </>
  );
}
