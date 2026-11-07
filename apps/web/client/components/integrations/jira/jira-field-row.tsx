// One field a Jira fields rule sets: which field of the Jira site, its value as its type takes it, and removing it.
import type { JiraFieldInfo, JiraFieldType, JiraFieldValue } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { VariableChips } from '../../settings/variable-chips';
import { Button, Field, inputClass } from '../../ui';

/** What to type for each type, as a placeholder. */
const PLACEHOLDERS: Record<JiraFieldType, string> = {
  text: '{pr.url}',
  textarea: 'Merged in {pr.url}',
  number: '{pr.number}',
  date: '{date.today}',
  datetime: '{date.now}',
  option: "The option's name, as Jira shows it",
  labels: 'qa, deployed',
};

const HINTS: Record<JiraFieldType, string> = {
  text: 'One line; variables are filled in when it runs.',
  textarea: 'Several lines; links become links.',
  number: 'A number, or a variable that gives one.',
  date: 'YYYY-MM-DD, or {date.today}.',
  datetime: 'An ISO date and time, or {date.now}.',
  option: 'Checked against the issue when the rule runs. Empty clears the field.',
  labels: 'Added to the issue, comma-separated; a label has no spaces.',
};

const TEXTAREA_ROWS = 3;

function ValueInput({
  entry,
  onChange,
}: {
  entry: JiraFieldValue;
  onChange: (value: string) => void;
}): ReactElement {
  const props = {
    className: inputClass,
    value: entry.value,
    placeholder: PLACEHOLDERS[entry.fieldType],
    'aria-label': `${entry.fieldName || 'Field'} value`,
  };
  return entry.fieldType === 'textarea' ? (
    <textarea
      {...props}
      rows={TEXTAREA_ROWS}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ) : (
    <input
      {...props}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export function JiraFieldRow({
  fields,
  entry,
  onChange,
  onRemove,
}: {
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
        <Field label="Value" hint={HINTS[entry.fieldType]}>
          <ValueInput
            entry={entry}
            onChange={(value) => {
              onChange({ ...entry, value });
            }}
          />
          {entry.fieldType === 'option' ? null : (
            <VariableChips
              onPick={(variable) => {
                onChange({ ...entry, value: `${entry.value}${variable}` });
              }}
            />
          )}
        </Field>
      )}
      <Button onClick={onRemove}>Remove this field</Button>
    </div>
  );
}
