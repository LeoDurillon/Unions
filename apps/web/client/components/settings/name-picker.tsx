// Picks names (labels, GitHub logins): the picked ones as chips, and a box that suggests the others and takes new ones.
import { useId, useState, type ReactElement } from 'react';

import { CheckChip, ChipGroup } from '../choice';
import { Button, inputClass } from '../ui';

/** The names picked, as chips that remove themselves when clicked. */
function PickedNames({
  names,
  onChange,
}: {
  names: string[];
  onChange: (names: string[]) => void;
}): ReactElement | null {
  if (names.length === 0) {
    return null;
  }
  return (
    <ChipGroup>
      {names.map((name) => (
        <CheckChip
          key={name}
          checked
          label={`Remove ${name}`}
          onChange={() => {
            onChange(names.filter((other) => other !== name));
          }}
        >
          {name}
        </CheckChip>
      ))}
    </ChipGroup>
  );
}

export function NamePicker({
  label,
  names,
  choices,
  placeholder,
  onChange,
}: {
  label: string;
  names: string[];
  /** Suggested in the box; a name not among them can still be typed. */
  choices: string[];
  placeholder: string;
  onChange: (names: string[]) => void;
}): ReactElement {
  const listId = useId();
  const [draft, setDraft] = useState('');
  const add = (): void => {
    const name = draft.trim();
    if (name !== '' && !names.includes(name)) {
      onChange([...names, name]);
    }
    setDraft('');
  };
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{label}</legend>
      <PickedNames names={names} onChange={onChange} />
      <div className="flex gap-2">
        <input
          className={inputClass}
          aria-label={label}
          list={listId}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button disabled={draft.trim() === ''} onClick={add}>
          Add
        </Button>
      </div>
      <datalist id={listId}>
        {choices
          .filter((choice) => !names.includes(choice))
          .map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
      </datalist>
    </fieldset>
  );
}
