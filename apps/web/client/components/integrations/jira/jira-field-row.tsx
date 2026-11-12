// One field a Jira fields rule sets: which field of the Jira site, its value as its type takes it, and removing it.

import {
  isPickedType,
  type JiraFieldInfo,
  type JiraFieldType,
  type JiraFieldValue,
  type JiraTypedType,
} from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { VariableChips } from '../../settings/variable-chips';
import { Button, Field, inputClass } from '../../ui/ui';
import { JiraPickField } from './jira-pick-field';

/** What to type for each type, as a placeholder. */
const PLACEHOLDERS: Record<JiraTypedType, string> = {
  text: '{pr.url}',
  textarea: 'Merged in {pr.url}',
  number: '{pr.number}',
  date: '{date.today}',
  datetime: '{date.now}',
  option: "The option's name, as Jira shows it",
  labels: 'qa, deployed',
  multi_option: 'Web, iOS',
};

const HINTS: Record<JiraFieldType, string> = {
  text: 'One line; variables are filled in when it runs.',
  textarea: 'Several lines; links become links.',
  number: 'A number, or a variable that gives one.',
  date: 'YYYY-MM-DD, or {date.today}.',
  datetime: 'An ISO date and time, or {date.now}.',
  option: 'Checked against the issue when the rule runs. Empty clears the field.',
  labels: 'Added to the issue, comma-separated; a label has no spaces.',
  multi_option:
    'Option names as Jira shows them, comma-separated; they replace the checked ones. Checked against the issue when the rule runs. Empty clears the field.',
  user: 'One of the people who can be assigned in the Jira project.',
  versions: "The project's versions; they replace the field's, and none checked empties it.",
  components: "The project's components; they replace the field's, and none checked empties it.",
  sprint:
    "The active or next sprint is the board's when the rule runs, so the rule keeps working from sprint to sprint.",
};

/** Options are picked by their names, so variables would never match one. */
const NO_VARIABLES = new Set<JiraFieldType>(['option', 'multi_option']);

const TEXTAREA_ROWS = 3;

function ValueInput({
  entry,
  type,
  onChange,
}: {
  entry: JiraFieldValue;
  type: JiraTypedType;
  onChange: (value: string) => void;
}): ReactElement {
  const props = {
    className: inputClass,
    value: entry.value,
    placeholder: PLACEHOLDERS[type],
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

/** The value as its type takes it: picked from Jira's lists, or typed (with variables but for options). */
function ValueField({
  projectId,
  entry,
  onChange,
}: {
  projectId: number;
  entry: JiraFieldValue;
  onChange: (entry: JiraFieldValue) => void;
}): ReactElement {
  const type = entry.fieldType;
  if (isPickedType(type)) {
    return (
      <Field label="Value" hint={HINTS[type]}>
        <JiraPickField
          projectId={projectId}
          label={`${entry.fieldName} value`}
          type={type}
          picks={entry.picks ?? []}
          onChange={(picks) => {
            onChange({ ...entry, picks, value: picks.map((pick) => pick.name).join(', ') });
          }}
        />
      </Field>
    );
  }
  return (
    <Field label="Value" hint={HINTS[type]}>
      <ValueInput
        entry={entry}
        type={type}
        onChange={(value) => {
          onChange({ ...entry, value });
        }}
      />
      {NO_VARIABLES.has(type) ? null : (
        <VariableChips
          onPick={(variable) => {
            onChange({ ...entry, value: `${entry.value}${variable}` });
          }}
        />
      )}
    </Field>
  );
}

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
        <ValueField projectId={projectId} entry={entry} onChange={onChange} />
      )}
      <Button onClick={onRemove}>Remove this field</Button>
    </div>
  );
}
