// The Jira settings' issue type for the issues Union creates (tickets written from investigations), from the project's.

import type { JiraRuleSource } from '@union/core';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../../ui/ui';

const HINT =
  'For the tickets an investigation writes with Also create it in Jira. Default: Task, else the project’s first type.';

export function JiraIssueTypeField({
  types,
  value,
  onChange,
}: {
  /** The project's types as last read; null until it is read (saving reads it). */
  types: JiraRuleSource['issueTypes'] | null;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const plain = (types ?? []).filter((type) => !type.subtask);
  return (
    <Field
      label="Issue type for new issues"
      hint={plain.length === 0 ? 'Save the connection to read the project’s issue types.' : HINT}
    >
      <select
        className={inputClass}
        value={value}
        disabled={plain.length === 0}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">Default (Task, or the project’s first type)</option>
        {plain.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
