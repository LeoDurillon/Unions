// A tracker tab's Properties side panel (Notion page, Jira issue): each property and its value, the empty ones folded.
// Laid out as the Overview's details. Properties the user hid fold under "N hidden", for the whole project.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { useHiddenFields, type HiddenFields } from '../../lib/integrations/use-hidden-fields';
import { TrackerPropertyRow, type TrackerPropertyEditing } from './tracker-property-row';

function Rows({
  properties,
  editing,
  hiding,
}: {
  properties: TrackerProperty[];
  editing: TrackerPropertyEditing;
  hiding: HiddenFields;
}): ReactElement {
  return (
    <>
      {properties.map((property) => {
        const hidden = hiding.hidden.has(property.id);
        return (
          <TrackerPropertyRow
            key={property.id}
            property={property}
            editing={editing}
            visibility={{
              hidden,
              onToggle: () => {
                hiding.setHidden(property.id, !hidden);
              },
            }}
          />
        );
      })}
    </>
  );
}

/** A fold at the bottom of the panel: `▸ 26 empty`, opened, `▾ Hide 26 empty`. */
function Fold({
  count,
  noun,
  open,
  onToggle,
}: {
  count: number;
  noun: string;
  open: boolean;
  onToggle: () => void;
}): ReactElement | null {
  if (count === 0) {
    return null;
  }
  return (
    <div className="py-3 last:pb-0">
      <button
        type="button"
        aria-expanded={open}
        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        onClick={onToggle}
      >
        {open ? '▾ Fold' : '▸'} {count} {noun}
      </button>
    </div>
  );
}

export function TrackerProperties({
  properties,
  editing,
}: {
  properties: TrackerProperty[];
  editing: TrackerPropertyEditing;
}): ReactElement | null {
  const [showEmpty, setShowEmpty] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const hiding = useHiddenFields(editing.projectId, editing.kind);
  if (properties.length === 0) {
    return null;
  }
  const shown = properties.filter((property) => !hiding.hidden.has(property.id));
  const hidden = properties.filter((property) => hiding.hidden.has(property.id));
  const filled = shown.filter((property) => property.text !== '');
  const empty = shown.filter((property) => property.text === '');
  const rows = { editing, hiding };
  return (
    <aside
      aria-label="Properties"
      className="h-fit divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-4 py-3 dark:divide-zinc-800 dark:border-zinc-800"
    >
      <h3 className="pb-3 text-sm font-semibold">Properties</h3>
      <Rows properties={filled} {...rows} />
      {showEmpty ? <Rows properties={empty} {...rows} /> : null}
      <Fold
        count={empty.length}
        noun="empty"
        open={showEmpty}
        onToggle={() => {
          setShowEmpty(!showEmpty);
        }}
      />
      {showHidden ? <Rows properties={hidden} {...rows} /> : null}
      <Fold
        count={hidden.length}
        noun="hidden"
        open={showHidden}
        onToggle={() => {
          setShowHidden(!showHidden);
        }}
      />
    </aside>
  );
}
