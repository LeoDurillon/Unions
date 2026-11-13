// The value of a Notion property, shaped by its type: a rule's (variables offered) or one typed in a tracker tab.

import type { NotionProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { joinChoices, partitionChoices } from '../../lib/settings/choice-values';
import { CheckChip, ChipGroup, toggled } from '../ui/choice';
import { Field, inputClass } from '../ui/ui';
import { PeopleField } from './people-field';
import { PlainValueInput } from './plain-value-input';
import { VariableChips } from './variable-chips';

const OTHER = '\u0000other';

/** Free text, with the variables as chips that append themselves when `variables`. */
function TemplateInput({
  value,
  placeholder,
  label,
  variables,
  onChange,
}: {
  value: string;
  placeholder: string;
  label?: string;
  variables: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <>
      <input
        className={`${inputClass} font-mono`}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
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

/**
 * A select or status: one of the Notion options. A select also takes "Other…" (a variable, or a new
 * name Notion creates); a status only takes its options, so an old one is shown as such.
 */
function ChoiceField({
  property,
  value,
  variables,
  onChange,
}: {
  property: NotionProperty;
  value: string;
  variables: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const known = value === '' || property.options.includes(value);
  const [other, setOther] = useState(!known);
  const status = property.type === 'status';
  const custom = other && !status;
  return (
    <Field label="Value">
      <select
        className={inputClass}
        value={custom ? OTHER : value}
        onChange={(event) => {
          const next = event.target.value;
          setOther(next === OTHER);
          onChange(next === OTHER ? '' : next);
        }}
      >
        <option value="">(empty: clear the field)</option>
        {property.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {status && !known ? <option value={value}>{value} (not in Notion any more)</option> : null}
        {status ? null : (
          <option value={OTHER}>
            {variables ? 'Other: a variable or a new option…' : 'Other: a new option…'}
          </option>
        )}
      </select>
      {custom ? (
        <TemplateInput
          value={value}
          placeholder={variables ? '{board.status}' : 'A new option'}
          label="Other value"
          variables={variables}
          onChange={onChange}
        />
      ) : null}
      {status && !known ? (
        <span className="block text-xs text-amber-700 dark:text-amber-400">
          “{value}” is no longer a status in Notion: pick another, or refresh from Notion.
        </span>
      ) : null}
    </Field>
  );
}

/** A multi-select: a box per Notion option, plus other names or variables. */
function MultiChoiceField({
  property,
  value,
  variables,
  onChange,
}: {
  property: NotionProperty;
  value: string;
  variables: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const { picked, other } = partitionChoices(value, property.options);
  const [otherText, setOtherText] = useState(joinChoices(other));
  const update = (names: string[], extra: string): void => {
    onChange(
      joinChoices([...names, ...extra.split(',').map((name) => name.trim())].filter(Boolean)),
    );
  };
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Values</legend>
      <ChipGroup>
        {property.options.map((option) => (
          <CheckChip
            key={option}
            checked={picked.includes(option)}
            onChange={(on) => {
              update(toggled(picked, option, on), otherText);
            }}
          >
            {option}
          </CheckChip>
        ))}
      </ChipGroup>
      <TemplateInput
        value={otherText}
        placeholder="Other values"
        label="Other values"
        variables={variables}
        onChange={(text) => {
          setOtherText(text);
          update(picked, text);
        }}
      />
      <span className="block text-xs text-zinc-500">
        Other values: comma-separated; new names are created in Notion.
      </span>
    </fieldset>
  );
}

/** The other types: a template in a rule, else the input the type takes. */
function TextValue({
  type,
  value,
  variables,
  onChange,
}: {
  type: string;
  value: string;
  variables: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  if (!variables) {
    return <PlainValueInput type={type} value={value} onChange={onChange} />;
  }
  return (
    <Field label="Value">
      <TemplateInput value={value} placeholder="{pr.url}" variables onChange={onChange} />
    </Field>
  );
}

/**
 * The value of a property, shaped by its type. `variables` (a rule's value) offers the variables
 * and takes text for the other types; without, they get the input their type takes.
 */
export function ValueField({
  projectId,
  property,
  value,
  variables = true,
  onChange,
}: {
  projectId: number;
  property: NotionProperty | undefined;
  value: string;
  variables?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const shared = { value, variables, onChange };
  if (property?.type === 'select' || property?.type === 'status') {
    return <ChoiceField key={property.id} property={property} {...shared} />;
  }
  if (property?.type === 'people') {
    return <PeopleField projectId={projectId} value={value} onChange={onChange} />;
  }
  if (property?.type === 'multi_select') {
    return <MultiChoiceField key={property.id} property={property} {...shared} />;
  }
  return <TextValue type={property?.type ?? ''} {...shared} />;
}
