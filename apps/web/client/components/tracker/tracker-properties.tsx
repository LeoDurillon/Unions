// A tracker tab's Properties side panel (Notion page, Jira issue): each property and its value, the empty ones folded.
// Laid out as the Overview's details; each one Union can set has Edit when the panel is given what editing needs.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { TrackerPropertyRow, type TrackerPropertyEditing } from './tracker-property-row';

function Rows({
  properties,
  editing,
}: {
  properties: TrackerProperty[];
  editing: TrackerPropertyEditing | null;
}): ReactElement {
  return (
    <>
      {properties.map((property) => (
        <TrackerPropertyRow key={property.id} property={property} editing={editing} />
      ))}
    </>
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
    <aside
      aria-label="Properties"
      className="h-fit divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-4 py-3 dark:divide-zinc-800 dark:border-zinc-800"
    >
      <h3 className="pb-3 text-sm font-semibold">Properties</h3>
      <Rows properties={filled} editing={editing} />
      {showEmpty ? <Rows properties={empty} editing={editing} /> : null}
      {empty.length > 0 ? (
        <div className="pt-3">
          <button
            type="button"
            aria-expanded={showEmpty}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={() => {
              setShowEmpty(!showEmpty);
            }}
          >
            {showEmpty ? '▾ Hide' : '▸'} {empty.length} empty
          </button>
        </div>
      ) : null}
    </aside>
  );
}
