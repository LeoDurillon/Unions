// The value of a Jira field as its type takes it: picked from Jira's lists, or typed, with variables in a rule.
// Typed by hand in a tracker tab (no variables), dates and numbers get the browser's inputs.

import {
  isPickedType,
  type JiraFieldType,
  type JiraFieldValue,
  type JiraTypedType,
} from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { VariableChips } from '../../settings/variable-chips';
import { Field, inputClass } from '../../ui/ui';
import { JiraPickField } from './jira-pick-field';

/** What to type for each type in a rule, as a placeholder. */
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

/** Typed by hand: only what is not plain from the input. */
const PLAIN_HINTS: Partial<Record<JiraFieldType, string>> = {
  option: "The option's name, as Jira shows it. Empty clears the field.",
  labels: 'Comma-separated; they replace the issue’s labels. A label has no spaces.',
  multi_option: 'Option names as Jira shows them, comma-separated. Empty clears the field.',
};

/** The browser's input for the typed types that have one. */
const PLAIN_INPUTS: Partial<Record<JiraTypedType, string>> = {
  number: 'number',
  date: 'date',
  datetime: 'datetime-local',
};

/** Options are picked by their names, so variables would never match one. */
const NO_VARIABLES = new Set<JiraFieldType>(['option', 'multi_option']);

const TEXTAREA_ROWS = 3;

function ValueInput({
  entry,
  type,
  variables,
  onChange,
}: {
  entry: JiraFieldValue;
  type: JiraTypedType;
  variables: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const props = {
    className: inputClass,
    value: entry.value,
    placeholder: variables ? PLACEHOLDERS[type] : undefined,
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
      type={variables ? 'text' : (PLAIN_INPUTS[type] ?? 'text')}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

/**
 * The value as its type takes it: picked from Jira's lists, or typed. `variables` (a rule's value)
 * offers the variables but for options, and the hints say when the rule checks it.
 */
export function JiraValueField({
  projectId,
  entry,
  variables = true,
  onChange,
}: {
  projectId: number;
  entry: JiraFieldValue;
  variables?: boolean;
  onChange: (entry: JiraFieldValue) => void;
}): ReactElement {
  const type = entry.fieldType;
  const hint = variables ? HINTS[type] : PLAIN_HINTS[type];
  if (isPickedType(type)) {
    return (
      <Field label="Value" hint={hint} labelHidden={!variables}>
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
    <Field label="Value" hint={hint} labelHidden={!variables}>
      <ValueInput
        entry={entry}
        type={type}
        variables={variables}
        onChange={(value) => {
          onChange({ ...entry, value });
        }}
      />
      {!variables || NO_VARIABLES.has(type) ? null : (
        <VariableChips
          onPick={(variable) => {
            onChange({ ...entry, value: `${entry.value}${variable}` });
          }}
        />
      )}
    </Field>
  );
}
