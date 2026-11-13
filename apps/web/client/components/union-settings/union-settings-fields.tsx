// The inputs of the Union settings pages: a whole number with its unit and bounds, and an image name.

import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui/ui';

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
  return (
    <Field label={label} hint={hint}>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={bounds.min}
          max={bounds.max}
          step={1}
          className={`${inputClass} w-24`}
          value={value}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
        {unit}
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
