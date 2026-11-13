// One field a Jira fields rule sets: which field of the Jira site, its value as its type takes it, and removing it.

import type { JiraFieldInfo, JiraFieldValue } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { Button, Field, inputClass } from '../../ui/ui';
import { JiraValueField } from './jira-value-field';

export function JiraFieldRow({
  projectId,
  fields,
  entry,
  onChange,
  onRemove,
}: {
  projectId: number;
  fields: JiraFieldInfo[];
  entry: JiraFieldValue;
  onChange: (entry: JiraFieldValue) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <Field label="Field">
        <select
          className={inputClass}
          value={entry.fieldId}
          onChange={(event) => {
            const field = fields.find((candidate) => candidate.id === event.target.value);
            if (field) {
              onChange({
                fieldId: field.id,
                fieldName: field.name,
                fieldType: field.type,
                value: '',
              });
            }
          }}
        >
          <option value="">Pick a field</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </Field>
      {entry.fieldId === '' ? null : (
        <JiraValueField projectId={projectId} entry={entry} onChange={onChange} />
      )}
      <Button onClick={onRemove}>Remove this field</Button>
    </div>
  );
}
