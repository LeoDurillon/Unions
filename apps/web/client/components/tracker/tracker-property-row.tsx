// One property in a tracker tab's side panel: its name and Edit, its value or the one being saved, why it was refused.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PendingTrackerField } from '../../../src/tracker-field-types';
import type { TrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { Button } from '../ui/ui';
import { TrackerPropertyEditor, type TrackerEditContext } from './tracker-property-editor';

/** What a card needs to let its properties be edited: the tracker, ticket and project, the changes being sent. */
export type TrackerPropertyEditing = TrackerEditContext & {
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
    <div className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={property.name}>
          {property.name}
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
      </div>
      {open && editing ? (
        <TrackerPropertyEditor
          context={editing}
          property={property}
          onSave={async (draft) => {
            await editing.sender.send(property.id, draft);
            setOpen(false);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
      ) : (
        <div className="min-w-0 break-words">
          <Value property={property} saving={saving} />
          {failure ? (
            <span className="block text-xs text-red-700 dark:text-red-400">{failure}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
