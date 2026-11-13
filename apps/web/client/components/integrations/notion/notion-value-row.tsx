// One property a Notion action sets: which property of the ticket's page, its value, and removing it.

import type { NotionProperty } from '@union/core';
import type { TrackerRuleValue } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

import { TrackerValueInput } from '../../tracker/tracker-value-input';
import { Button, Field, inputClass } from '../../ui/ui';

/** Which property of the page the row sets; another property starts the value over. */
function PropertySelect({
  choices,
  entry,
  onChange,
}: {
  choices: NotionProperty[];
  entry: TrackerRuleValue;
  onChange: (entry: TrackerRuleValue) => void;
}): ReactElement {
  return (
    <Field label="Property">
      <select
        className={inputClass}
        value={entry.fieldId}
        onChange={(event) => {
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
  );
}

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
          <PropertySelect choices={choices} entry={entry} onChange={onChange} />
        </div>
        {onRemove ? (
          <Button aria-label={`Remove ${property?.name ?? 'this property'}`} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      {property ? (
        <TrackerValueInput
          projectId={projectId}
          tracker="notion"
          field={property}
          draft={{ value: entry.value, picks: [], text: '' }}
          variables
          onChange={({ value }) => {
            onChange({ ...entry, value });
          }}
        />
      ) : null}
    </div>
  );
}
