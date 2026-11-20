// The inputs of the Union settings pages: a whole number with its unit and bounds (or none), and an image name.

import { useState, type ReactElement } from 'react';

import { numberProblem, parseTyped } from '../../lib/union-settings/number-problem';
import { Field, inputClass } from '../ui/ui';

type NumberFieldProps<T extends number | null> = {
  label: string;
  hint: string;
  unit: string;
  bounds: { min: number; max: number };
  value: T;
  onChange: (value: T) => void;
};

/**
 * A whole number with its unit. The text stays as typed (an emptied field is not 0); a value that is
 * not a whole number within `bounds` reaches the form as such, says why here, and the page refuses Save.
 */
export function NumberField(props: NumberFieldProps<number>): ReactElement {
  return <WholeNumberInput {...props} parse={parseTyped} />;
}

/** A whole number that may be left empty: empty is null (`placeholder` says what that means). */
export function OptionalNumberField({
  placeholder,
  ...props
}: NumberFieldProps<number | null> & { placeholder: string }): ReactElement {
  return (
    <WholeNumberInput
      {...props}
      placeholder={placeholder}
      parse={(text) => (text.trim() === '' ? null : parseTyped(text))}
    />
  );
}

function WholeNumberInput<T extends number | null>({
  label,
  hint,
  unit,
  bounds,
  value,
  onChange,
  parse,
  placeholder,
}: NumberFieldProps<T> & { parse: (text: string) => T; placeholder?: string }): ReactElement {
  // The text as typed, and the value it gave. A value set from outside (Discard, a reload) replaces it.
  const shown = (next: T): string => (next === null ? '' : String(next));
  const [typed, setTyped] = useState({ text: shown(value), value });
  if (!Object.is(typed.value, value)) {
    setTyped({ text: shown(value), value });
  }
  const problem = value === null ? null : numberProblem(label, value, bounds);
  return (
    <Field label={label} hint={hint}>
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={bounds.min}
          max={bounds.max}
          step={1}
          placeholder={placeholder}
          aria-invalid={problem !== null}
          className={`${inputClass} w-24`}
          value={typed.text}
          onChange={(event) => {
            const next = parse(event.target.value);
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
