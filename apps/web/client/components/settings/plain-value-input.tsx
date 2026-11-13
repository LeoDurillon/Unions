// A Notion property's value typed by hand (no variables), with the input its type takes: a date, a number, yes or no.

import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui/ui';

/** The HTML input type for the types a browser has one for; the others are text. */
const INPUT_TYPES: Record<string, string> = {
  number: 'number',
  url: 'url',
  email: 'email',
  phone_number: 'tel',
};

const TEXTAREA_ROWS = 3;
/** A date with a time (`2026-11-12T16:15`): a date input would drop it, so it stays text. */
const HAS_TIME = /T\d/u;

function YesNo({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <select
      className={inputClass}
      value={value === 'true' ? 'true' : 'false'}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

function Input({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  if (type === 'checkbox') {
    return <YesNo value={value} onChange={onChange} />;
  }
  if (type === 'rich_text') {
    return (
      <textarea
        className={inputClass}
        rows={TEXTAREA_ROWS}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  }
  const date = type === 'date' && !HAS_TIME.test(value);
  return (
    <input
      className={inputClass}
      type={date ? 'date' : (INPUT_TYPES[type] ?? 'text')}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

/** The value of a property of `type` (Notion's), as a rule's value text takes it; empty clears it. */
export function PlainValueInput({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Field label="Value" labelHidden>
      <Input type={type} value={value} onChange={onChange} />
    </Field>
  );
}
