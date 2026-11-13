// A rule's value typed as a template: free text (one line or several), with the variables as chips that append themselves.

import type { ReactElement } from 'react';

import { VariableChips } from '../settings/variable-chips';
import { inputClass } from '../ui/ui';

const TEXTAREA_ROWS = 3;

export function TemplateInput({
  value,
  placeholder,
  label,
  variables,
  multiline = false,
  onChange,
}: {
  value: string;
  placeholder: string;
  label?: string;
  /** Offer the variables as chips. */
  variables: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const props = {
    className: `${inputClass} font-mono`,
    value,
    'aria-label': label,
    placeholder,
    onChange: (event: { target: { value: string } }): void => {
      onChange(event.target.value);
    },
  };
  return (
    <>
      {multiline ? <textarea {...props} rows={TEXTAREA_ROWS} /> : <input {...props} />}
      {variables ? (
        <VariableChips
          onPick={(variable) => {
            onChange(`${value}${variable}`);
          }}
        />
      ) : null}
    </>
  );
}
