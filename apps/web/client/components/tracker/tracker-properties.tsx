// A tracker tab's Properties card (Notion page, Jira issue): each property and its value, the empty ones folded.
// Each one Union can set has Edit when the card is given what editing needs.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { CARD_CLASS } from '../ui/ui';
import { TrackerPropertyRow, type TrackerPropertyEditing } from './tracker-property-row';

function Rows({
  properties,
  editing,
}: {
  properties: TrackerProperty[];
  editing: TrackerPropertyEditing | null;
}): ReactElement {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {properties.map((property) => (
        <TrackerPropertyRow key={property.id} property={property} editing={editing} />
      ))}
    </dl>
  );
}

export function TrackerProperties({
  properties,
  editing,
}: {
  properties: TrackerProperty[];
  /** Null: read only. */
  editing: TrackerPropertyEditing | null;
}): ReactElement | null {
  const [showEmpty, setShowEmpty] = useState(false);
  if (properties.length === 0) {
    return null;
  }
  const filled = properties.filter((property) => property.text !== '');
  const empty = properties.filter((property) => property.text === '');
  return (
    <section className={CARD_CLASS} aria-label="Properties">
      <h3 className="text-sm font-semibold">Properties</h3>
      {filled.length > 0 ? <Rows properties={filled} editing={editing} /> : null}
      {empty.length > 0 ? (
        <button
          type="button"
          aria-expanded={showEmpty}
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={() => {
            setShowEmpty(!showEmpty);
          }}
        >
          {showEmpty ? '▾' : '▸'} {empty.length} empty
        </button>
      ) : null}
      {showEmpty ? <Rows properties={empty} editing={editing} /> : null}
    </section>
  );
}
