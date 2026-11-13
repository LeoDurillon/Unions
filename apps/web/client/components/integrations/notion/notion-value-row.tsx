// One property a Notion action sets: which property of the ticket's page, its value, and removing it.

import type { NotionProperty } from '@union/core';
import type { TrackerRuleValue } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

import { ValueField } from '../../settings/value-field';
import { Button, Field, inputClass } from '../../ui/ui';

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
  entry: TrackerRuleValue;
  onChange: (entry: TrackerRuleValue) => void;
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
              value={entry.fieldId}
              onChange={(event) => {
                // Another property, another type: the value starts over.
                const picked = choices.find((candidate) => candidate.id === event.target.value);
                onChange({
                  fieldId: picked?.id ?? '',
                  fieldName: picked?.name ?? '',
                  fieldType: picked?.type ?? '',
                  value: '',
                });
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
