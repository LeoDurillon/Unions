// A Notion action's fields: the properties of the ticket's Notion page to set, a row each.
import type { NotionSchema } from '@union/core';
import type { NotionPropertyAction, NotionValue } from '@union/core/event-actions';
import { WRITABLE_NOTION_TYPES } from '@union/core/event-rules';
import type { ReactElement } from 'react';

import { Button } from '../../ui';
import { NotionValueRow } from './notion-value-row';

function NoNotion(): ReactElement {
  return (
    <p className="text-sm text-zinc-500">
      Connect the project to Notion, then read its columns (Refresh from Notion), to set a property.
    </p>
  );
}

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
    return <NoNotion />;
  }
  const writable = notion.properties.filter((property) =>
    WRITABLE_NOTION_TYPES.some((type) => type === property.type),
  );
  const used = new Set(action.values.map((entry) => entry.propertyId));
  const update = (values: NotionValue[]): void => {
    onChange({ ...action, values });
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        The properties of the ticket&apos;s Notion page to set ({notion.title})
      </legend>
      {action.values.map((entry, index) => (
        <NotionValueRow
          // Each property is set once and one row at most has none yet: a row is its property.
          key={entry.propertyId}
          projectId={projectId}
          choices={writable.filter((p) => p.id === entry.propertyId || !used.has(p.id))}
          property={notion.properties.find((candidate) => candidate.id === entry.propertyId)}
          entry={entry}
          onChange={(next) => {
            update(action.values.map((other, at) => (at === index ? next : other)));
          }}
          onRemove={
            action.values.length > 1
              ? () => {
                  update(action.values.filter((_other, at) => at !== index));
                }
              : null
          }
        />
      ))}
      <Button
        disabled={used.has('') || writable.every((property) => used.has(property.id))}
        onClick={() => {
          update([...action.values, { propertyId: '', value: '' }]);
        }}
      >
        Add a property
      </Button>
    </fieldset>
  );
}
