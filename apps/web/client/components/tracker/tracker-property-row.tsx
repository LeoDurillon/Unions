// One property in a tracker tab's side panel: its name and Edit, its value or the one being saved, why it was refused.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { PendingTrackerField } from '../../../src/tracker-field-types';
import type { TrackerFieldSend } from '../../lib/integrations/use-tracker-fields';
import { Button } from '../ui/ui';
import { TrackerPropertyEditor, type TrackerEditContext } from './tracker-property-editor';

/** What a panel needs to let its properties be edited and hidden: the tracker, the project, the changes being sent. */
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

/** Whether the project hides a property, and hiding or showing it. */
type Visibility = { hidden: boolean; onToggle: () => void };

/** Hide (or Show) and Edit, beside the property's name. */
function RowActions({
  name,
  visibility,
  onEdit,
}: {
  name: string;
  visibility: Visibility;
  /** Null: Union cannot set it, or a change is being saved. */
  onEdit: (() => void) | null;
}): ReactElement {
  const { hidden, onToggle } = visibility;
  return (
    <span className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${hidden ? 'Show' : 'Hide'} ${name}`}
        title={
          visibility.hidden
            ? 'Show it again in this project’s tabs'
            : 'Hide it in this project’s tabs'
        }
        onClick={onToggle}
      >
        {hidden ? 'Show' : 'Hide'}
      </Button>
      {onEdit ? (
        <Button variant="ghost" size="sm" aria-label={`Edit ${name}`} onClick={onEdit}>
          Edit
        </Button>
      ) : null}
    </span>
  );
}

export function TrackerPropertyRow({
  property,
  editing,
  visibility,
}: {
  property: TrackerProperty;
  editing: TrackerPropertyEditing;
  /** Whether the project hides it, and hiding or showing it. */
  visibility: Visibility;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const saving = editing.pending.findLast((change) => change.fieldId === property.id);
  const failure = editing.sender.failures.get(property.id);
  const canEdit = property.settable && !saving;
  return (
    <div className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={property.name}>
          {property.name}
        </span>
        {open ? null : (
          <RowActions
            name={property.name}
            visibility={visibility}
            onEdit={
              canEdit
                ? () => {
                    editing.sender.dismiss(property.id);
                    setOpen(true);
                  }
                : null
            }
          />
        )}
      </div>
      {open ? (
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
