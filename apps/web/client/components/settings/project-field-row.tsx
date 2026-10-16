// One field a Project fields rule sets: which field of the GitHub Project, its value (an option or a template), and removing it.
import type { ProjectField, ProjectFieldValue } from '@union/core/event-project-fields';
import type { ReactElement } from 'react';

import { Button, Field, inputClass } from '../ui';
import { VariableChips } from './variable-chips';

const PLACEHOLDERS: Record<ProjectField['type'], string> = {
  single_select: '',
  text: '{pr.url}',
  number: '{pr.number}',
  date: '{date.today}',
};

function FieldValue({
  field,
  entry,
  onChange,
}: {
  field: ProjectField | undefined;
  entry: ProjectFieldValue;
  onChange: (value: string) => void;
}): ReactElement {
  if (entry.fieldType === 'single_select') {
    const options = field?.options ?? [];
    return (
      <Field label="Option">
        <select
          className={inputClass}
          value={entry.value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <option value="">(empty: clear the field)</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {entry.value !== '' && !options.includes(entry.value) ? (
            <option value={entry.value}>{entry.value} (not in the Project any more)</option>
          ) : null}
        </select>
      </Field>
    );
  }
  return (
    <Field label="Value" hint={entry.fieldType === 'date' ? 'A date: YYYY-MM-DD' : undefined}>
      <input
        className={`${inputClass} font-mono`}
        value={entry.value}
        placeholder={PLACEHOLDERS[entry.fieldType]}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <VariableChips
        onPick={(variable) => {
          onChange(`${entry.value}${variable}`);
        }}
      />
    </Field>
  );
}

/** Picks the field; another field starts its value over. */
function FieldPicker({
  choices,
  field,
  entry,
  onChange,
}: {
  choices: ProjectField[];
  field: ProjectField | undefined;
  entry: ProjectFieldValue;
  onChange: (entry: ProjectFieldValue) => void;
}): ReactElement {
  return (
    <Field label="Field">
      <select
        className={inputClass}
        value={entry.fieldId}
        onChange={(event) => {
          const picked = choices.find((candidate) => candidate.id === event.target.value);
          onChange(
            picked
              ? { fieldId: picked.id, fieldName: picked.name, fieldType: picked.type, value: '' }
              : { ...entry, fieldId: '', value: '' },
          );
        }}
      >
        <option value="">Pick a field…</option>
        {choices.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} ({candidate.type.replace('_', ' ')})
          </option>
        ))}
        {entry.fieldId !== '' && !field ? (
          <option value={entry.fieldId}>{entry.fieldName} (not in the Project any more)</option>
        ) : null}
      </select>
    </Field>
  );
}

export function ProjectFieldRow({
  choices,
  field,
  entry,
  onChange,
  onRemove,
}: {
  /** The fields this row can pick: the ones no other row sets. */
  choices: ProjectField[];
  field: ProjectField | undefined;
  entry: ProjectFieldValue;
  onChange: (entry: ProjectFieldValue) => void;
  /** Null for the last row: the action sets one field at least. */
  onRemove: (() => void) | null;
}): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FieldPicker choices={choices} field={field} entry={entry} onChange={onChange} />
        </div>
        {onRemove ? (
          <Button aria-label={`Remove ${entry.fieldName || 'this field'}`} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      {entry.fieldId === '' ? null : (
        <FieldValue
          field={field}
          entry={entry}
          onChange={(value) => {
            onChange({ ...entry, value });
          }}
        />
      )}
    </div>
  );
}
