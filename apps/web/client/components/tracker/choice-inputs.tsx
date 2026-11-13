// A choice's value: one of the tracker's options, or several as boxes. A tracker that creates options also takes
// "Other…" (a new name, or a variable in a rule); one that does not shows a value no longer an option as such.

import { useState, type ReactElement } from 'react';

import { joinChoices, partitionChoices } from '../../lib/settings/choice-values';
import { CheckChip, ChipGroup, toggled } from '../ui/choice';
import { inputClass } from '../ui/ui';
import { TemplateInput } from './template-input';

const OTHER = '\u0000other';

/** What every choice input takes: its options, whether others can be typed, and the tracker's name. */
export type ChoiceProps = {
  options: readonly string[];
  /** A value outside the options can be typed: a new option the tracker creates (and a variable in a rule). */
  newOptions: boolean;
  /** A rule's value: variables are offered. */
  variables: boolean;
  /** The tracker's name, as "not in Notion any more" says it. */
  tracker: string;
  value: string;
  onChange: (value: string) => void;
};

export function ChoiceInput({
  options,
  newOptions,
  variables,
  tracker,
  value,
  onChange,
}: ChoiceProps): ReactElement {
  const known = value === '' || options.includes(value);
  const [other, setOther] = useState(!known);
  const custom = other && newOptions;
  const stale = !newOptions && !known;
  return (
    <>
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
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {stale ? (
          <option value={value}>
            {value} (not in {tracker} any more)
          </option>
        ) : null}
        {newOptions ? (
          <option value={OTHER}>
            {variables ? 'Other: a variable or a new option…' : 'Other: a new option…'}
          </option>
        ) : null}
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
      {stale ? (
        <span className="block text-xs text-amber-700 dark:text-amber-400">
          “{value}” is no longer an option in {tracker}: pick another, or refresh from {tracker}.
        </span>
      ) : null}
    </>
  );
}

/** A box per option; with new options, other names (or variables) typed beside them. */
export function MultiChoiceInput({
  options,
  newOptions,
  variables,
  tracker,
  value,
  onChange,
}: ChoiceProps): ReactElement {
  const { picked, other } = partitionChoices(value, [...options]);
  const [otherText, setOtherText] = useState(joinChoices(other));
  const update = (names: string[], extra: string): void => {
    onChange(
      joinChoices([...names, ...extra.split(',').map((name) => name.trim())].filter(Boolean)),
    );
  };
  return (
    <fieldset className="space-y-1">
      <legend className={variables ? 'text-sm font-medium' : 'sr-only'}>Values</legend>
      <ChipGroup>
        {options.map((option) => (
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
      {newOptions ? (
        <>
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
            Other values: comma-separated; new names are created in {tracker}.
          </span>
        </>
      ) : null}
    </fieldset>
  );
}
