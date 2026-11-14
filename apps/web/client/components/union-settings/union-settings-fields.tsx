// The inputs of the Union settings pages: a whole number with its unit and bounds, and an image name.

import { useState, type ReactElement } from 'react';

import { numberProblem, parseTyped } from '../../lib/union-settings/number-problem';
import { Field, inputClass } from '../ui/ui';

/**
 * A whole number with its unit. The text stays as typed (an emptied field is not 0); a value that is
 * not a whole number within `bounds` reaches the form as such, says why here, and the page refuses Save.
 */
export function NumberField({
  label,
  hint,
  unit,
  bounds,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  unit: string;
  bounds: { min: number; max: number };
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  // The text as typed, and the value it gave. A value set from outside (Discard, a reload) replaces it.
  const [typed, setTyped] = useState({ text: String(value), value });
  if (!Object.is(typed.value, value)) {
    setTyped({ text: String(value), value });
  }
  const problem = numberProblem(label, value, bounds);
  return (
    <Field label={label} hint={hint}>
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={bounds.min}
          max={bounds.max}
          step={1}
          aria-invalid={problem !== null}
          className={`${inputClass} w-24`}
          value={typed.text}
          onChange={(event) => {
            const next = parseTyped(event.target.value);
            setTyped({ text: event.target.value, value: next });
            onChange(next);
          }}
        />
        {unit}
        {problem === null ? null : (
          <span className="text-xs text-red-600 dark:text-red-400">
            Enter a whole number from {bounds.min} to {bounds.max}.
          </span>
        )}
      </span>
    </Field>
  );
}

/** An image name; left empty, Union's default (`placeholder`), saved as null. */
export function ImageField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string | null) => void;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      <span className="flex">
        <input
          className={`${inputClass} font-mono`}
          value={value ?? ''}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value === '' ? null : event.target.value);
          }}
        />
      </span>
    </Field>
  );
}
