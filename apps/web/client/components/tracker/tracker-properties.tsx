// A tracker tab's Properties card (Notion page, Jira issue): each property and its value, the empty ones folded.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { CARD_CLASS } from '../ui/ui';

function Rows({ properties }: { properties: TrackerProperty[] }): ReactElement {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {properties.map((property) => (
        <div key={property.id} className="contents">
          <dt className="truncate text-zinc-500" title={property.name}>
            {property.name}
          </dt>
          <dd className="min-w-0 break-words">
            {property.text === '' ? <span className="text-zinc-400">Empty</span> : property.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TrackerProperties({
  properties,
}: {
  properties: TrackerProperty[];
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
      {filled.length > 0 ? <Rows properties={filled} /> : null}
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
      {showEmpty ? <Rows properties={empty} /> : null}
    </section>
  );
}
