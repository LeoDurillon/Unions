import type { NotionProperty } from '@union/core';
import { TEMPLATE_VARIABLES } from '@union/core/event-rules';
import { useState, type ReactElement } from 'react';

import { joinChoices, partitionChoices } from '../../lib/choice-values';
import { CheckChip, ChipGroup, toggled } from '../choice';
import { Field, inputClass } from '../ui';
import { PeopleField } from './people-field';

const OTHER = '\u0000other';

/** Free text with the variables as chips that append themselves. */
function TemplateInput({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  placeholder: string;
  label?: string;
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
      <span className="flex flex-wrap gap-1">
        {TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable.name}
            type="button"
            title={variable.description}
            className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs hover:bg-indigo-100 dark:bg-zinc-800 dark:hover:bg-indigo-950"
            onClick={() => {
              onChange(`${value}{${variable.name}}`);
            }}
          >
            {`{${variable.name}}`}
          </button>
        ))}
      </span>
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
  onChange,
}: {
  property: NotionProperty;
  value: string;
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
        {status ? null : <option value={OTHER}>Other: a variable or a new option…</option>}
      </select>
      {custom ? (
        <TemplateInput
          value={value}
          placeholder="{board.status}"
          label="Other value"
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
  onChange,
}: {
  property: NotionProperty;
  value: string;
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

/** The value a rule sets, shaped by the property's type. */
export function ValueField({
  projectId,
  property,
  value,
  onChange,
}: {
  projectId: number;
  property: NotionProperty | undefined;
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  if (property?.type === 'select' || property?.type === 'status') {
    return <ChoiceField key={property.id} property={property} value={value} onChange={onChange} />;
  }
  if (property?.type === 'people') {
    return <PeopleField projectId={projectId} value={value} onChange={onChange} />;
  }
  if (property?.type === 'multi_select') {
    return (
      <MultiChoiceField key={property.id} property={property} value={value} onChange={onChange} />
    );
  }
  return (
    <Field label="Value">
      <TemplateInput value={value} placeholder="{pr.url}" onChange={onChange} />
    </Field>
  );
}
