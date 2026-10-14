import { useState, type ReactElement } from 'react';

import { inputClass } from '../ui';

/**
 * The compose profiles to enable: a box per profile the file has (once a ticket's file was
 * generated), and a field for others. Services in profiles left out do not run.
 */
export function PreviewProfilesField({
  selected,
  known,
  onChange,
}: {
  selected: string[];
  known: string[];
  onChange: (profiles: string[]) => void;
}): ReactElement {
  // The text as typed: rebuilding it from the parsed list would eat a comma or a space as it is typed.
  const [othersText, setOthersText] = useState(() =>
    selected.filter((profile) => !known.includes(profile)).join(', '),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Profiles</legend>
      <p className="text-xs text-zinc-500">
        Services with a <code>profiles:</code> entry run only when one of their profiles is enabled.
      </p>
      {known.length > 0 ? (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {known.map((profile) => (
            <label key={profile} className="flex items-center gap-1.5 font-mono text-sm">
              <input
                type="checkbox"
                checked={selected.includes(profile)}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, profile]
                      : selected.filter((name) => name !== profile),
                  );
                }}
              />
              {profile}
            </label>
          ))}
        </span>
      ) : null}
      <input
        aria-label="Other profiles"
        className={`${inputClass} font-mono`}
        value={othersText}
        placeholder={known.length > 0 ? 'Other profiles, comma-separated' : 'storage, jobs'}
        onChange={(event) => {
          setOthersText(event.target.value);
          const typed = event.target.value
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name !== '');
          onChange([...selected.filter((profile) => known.includes(profile)), ...typed]);
        }}
      />
    </fieldset>
  );
}
