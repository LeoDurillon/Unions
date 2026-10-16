// One property a Notion action sets: which property of the ticket's page, its value, and removing it.
import type { NotionProperty } from '@union/core';
import type { NotionValue } from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { Button, Field, inputClass } from '../ui';
import { ValueField } from './value-field';

export function NotionValueRow({
  projectId,
  choices,
  property,
  entry,
  onChange,
  onRemove,
}: {
  projectId: number;
  /** The properties this row can pick: the writable ones no other row sets. */
  choices: NotionProperty[];
  property: NotionProperty | undefined;
  entry: NotionValue;
  onChange: (entry: NotionValue) => void;
  /** Null for the last row: the action sets one property at least. */
  onRemove: (() => void) | null;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Property">
            <select
              className={inputClass}
              value={entry.propertyId}
              onChange={(event) => {
                // Another property, another type: the value starts over.
                onChange({ propertyId: event.target.value, value: '' });
              }}
            >
              <option value="">Pick a property…</option>
              {choices.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.type.replace('_', ' ')})
                </option>
              ))}
            </select>
          </Field>
        </div>
        {onRemove ? (
          <Button aria-label={`Remove ${property?.name ?? 'this property'}`} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      <ValueField
        projectId={projectId}
        property={property}
        value={entry.value}
        onChange={(value) => {
          onChange({ ...entry, value });
        }}
      />
    </div>
  );
}
