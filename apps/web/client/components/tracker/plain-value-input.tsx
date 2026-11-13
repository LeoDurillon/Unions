// A tracker field's value typed by hand (no variables), with the input its shared type takes: a date, a number, yes or no.

import type { TrackerFieldType } from '@union/core/tracker-field-types';
import type { ReactElement } from 'react';

import { inputClass } from '../ui/ui';

/** The HTML input type for the types a browser has one for; the others are text. */
const INPUT_TYPES: Partial<Record<TrackerFieldType, string>> = {
  number: 'number',
  url: 'url',
  email: 'email',
  phone: 'tel',
  datetime: 'datetime-local',
};

const TEXTAREA_ROWS = 3;
/** A date with a time (`2026-11-12T16:15`): a date input would drop it, so it stays text. */
const HAS_TIME = /T\d/u;

function YesNo({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <select
      className={inputClass}
      aria-label={label}
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

/** The value of a field of `type`, as a rule's value text takes it; empty clears it. */
export function PlainValueInput({
  type,
  value,
  label,
  onChange,
}: {
  type: TrackerFieldType;
  value: string;
  label: string;
  onChange: (value: string) => void;
}): ReactElement {
  if (type === 'checkbox') {
    return <YesNo value={value} label={label} onChange={onChange} />;
  }
  const props = {
    className: inputClass,
    value,
    'aria-label': label,
    onChange: (event: { target: { value: string } }): void => {
      onChange(event.target.value);
    },
  };
  if (type === 'textarea') {
    return <textarea {...props} rows={TEXTAREA_ROWS} />;
  }
  const date = type === 'date' && !HAS_TIME.test(value);
  return <input {...props} type={date ? 'date' : (INPUT_TYPES[type] ?? 'text')} />;
}
