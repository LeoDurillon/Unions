// A Notion action's fields: the property of the ticket's Notion page to set, and its value.
import type { NotionSchema } from '@union/core';
import type { NotionPropertyAction } from '@union/core/event-actions';
import { WRITABLE_NOTION_TYPES } from '@union/core/event-rules';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui';
import { ValueField } from './value-field';

export function NotionActionFields({
  projectId,
  notion,
  action,
  onChange,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: NotionPropertyAction;
  onChange: (action: NotionPropertyAction) => void;
}): ReactElement {
  if (!notion) {
    return (
      <p className="text-sm text-zinc-500">
        Connect the project to Notion, then read its columns (Refresh from Notion), to set a
        property.
      </p>
    );
  }
  const writable = notion.properties.filter((property) =>
    WRITABLE_NOTION_TYPES.some((type) => type === property.type),
  );
  const property = notion.properties.find((candidate) => candidate.id === action.propertyId);
  return (
    <>
      <Field label={`The property of the ticket's Notion page to set (${notion.title})`}>
        <select
          className={inputClass}
          value={action.propertyId}
          onChange={(event) => {
            // Another property, another type: the value starts over.
            onChange({ ...action, propertyId: event.target.value, value: '' });
          }}
        >
          <option value="">Pick a property…</option>
          {writable.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({candidate.type.replace('_', ' ')})
            </option>
          ))}
        </select>
      </Field>
      <ValueField
        projectId={projectId}
        property={property}
        value={action.value}
        onChange={(value) => {
          onChange({ ...action, value });
        }}
      />
    </>
  );
}
