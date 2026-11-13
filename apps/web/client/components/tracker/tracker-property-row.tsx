// One row of a tracker tab's Properties card: the name, the value (or the new one being saved), Edit, why it was refused.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PendingTrackerField } from '../../../src/tracker-field-types';
import type { TrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { Button } from '../ui/ui';
import { TrackerPropertyEditor } from './tracker-property-editor';

/** What a card needs to let its properties be edited: the project (for its lists), the changes being sent. */
export type TrackerPropertyEditing = {
  projectId: number;
  pending: PendingTrackerField[];
  sender: TrackerFieldSend;
};

function Value({
  property,
  saving,
}: {
  property: TrackerProperty;
  saving: PendingTrackerField | undefined;
}): ReactElement {
  if (saving) {
    return (
      <span className="opacity-70">
        {saving.text || 'Empty'} <span className="text-xs text-zinc-500">Saving…</span>
      </span>
    );
  }
  return property.text === '' ? (
    <span className="text-zinc-400">Empty</span>
  ) : (
    <span>{property.text}</span>
  );
}

export function TrackerPropertyRow({
  property,
  editing,
}: {
  property: TrackerProperty;
  /** Null: the card is read only. */
  editing: TrackerPropertyEditing | null;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const saving = editing?.pending.findLast((change) => change.fieldId === property.id);
  const failure = editing?.sender.failures.get(property.id);
  const canEdit = editing !== null && property.settable && !saving && !open;
  return (
    <div className="contents">
      <dt className="truncate text-zinc-500" title={property.name}>
        {property.name}
      </dt>
      <dd className="group flex min-w-0 items-start justify-between gap-2 break-words">
        <span className="min-w-0">
          <Value property={property} saving={saving} />
          {failure ? (
            <span className="block text-xs text-red-700 dark:text-red-400">{failure}</span>
          ) : null}
        </span>
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${property.name}`}
            onClick={() => {
              editing.sender.dismiss(property.id);
              setOpen(true);
            }}
          >
            Edit
          </Button>
        ) : null}
      </dd>
      {open && editing ? (
        <dd className="col-span-2">
          <TrackerPropertyEditor
            projectId={editing.projectId}
            property={property}
            onSave={async (value, text) => {
              await editing.sender.send(property.id, value, text);
              setOpen(false);
            }}
            onCancel={() => {
              setOpen(false);
            }}
          />
        </dd>
      ) : null}
    </div>
  );
}
