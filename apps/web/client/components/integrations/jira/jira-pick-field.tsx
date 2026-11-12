// The value of a picked Jira field in the rule editor: a person, a sprint, versions or components.
// A person or a sprint is picked from a list, versions or components as boxes; what was picked
// before and is no longer listed stays, so it can be removed.

import { isSinglePick, type JiraPick, type JiraPickedType } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { useJiraPicks } from '../../../lib/integrations/use-jira-picks';
import { CheckChip, ChipGroup } from '../../choice';
import { ErrorText, inputClass } from '../../ui';

const NONE: Record<'user' | 'sprint', string> = {
  user: 'Nobody (clears the field)',
  sprint: 'No sprint (clears the field)',
};

const READING: Record<JiraPickedType, string> = {
  user: 'Reading the people who can be assigned…',
  sprint: "Reading the board's sprints…",
  versions: "Reading the project's versions…",
  components: "Reading the project's components…",
};

function SinglePick({
  label,
  type,
  options,
  picked,
  onChange,
}: {
  label: string;
  type: 'user' | 'sprint';
  options: JiraPick[];
  picked: JiraPick | undefined;
  onChange: (picks: JiraPick[]) => void;
}): ReactElement {
  return (
    <select
      className={inputClass}
      aria-label={label}
      value={picked?.id ?? ''}
      onChange={(event) => {
        const pick = options.find((option) => option.id === event.target.value);
        onChange(pick ? [pick] : []);
      }}
    >
      <option value="">{NONE[type]}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

function ManyPicks({
  options,
  picked,
  onChange,
}: {
  options: JiraPick[];
  picked: JiraPick[];
  onChange: (picks: JiraPick[]) => void;
}): ReactElement {
  return (
    <ChipGroup>
      {options.map((option) => (
        <CheckChip
          key={option.id}
          checked={picked.some((pick) => pick.id === option.id)}
          onChange={(on) => {
            onChange(on ? [...picked, option] : picked.filter((pick) => pick.id !== option.id));
          }}
        >
          {option.name}
        </CheckChip>
      ))}
    </ChipGroup>
  );
}

export function JiraPickField({
  projectId,
  label,
  type,
  picks,
  onChange,
}: {
  projectId: number;
  label: string;
  type: JiraPickedType;
  picks: JiraPick[];
  onChange: (picks: JiraPick[]) => void;
}): ReactElement {
  const list = useJiraPicks(projectId, type);
  const listed = list.data ?? [];
  const gone = list.isPending
    ? []
    : picks.filter((pick) => !listed.some((option) => option.id === pick.id));
  const options = [
    ...listed,
    ...gone.map((pick) => ({ id: pick.id, name: `${pick.name} (not listed now)` })),
  ];
  return (
    <div className="space-y-1">
      {list.isPending ? <p className="text-sm text-zinc-500">{READING[type]}</p> : null}
      <ErrorText error={list.error} />
      {isSinglePick(type) ? (
        <SinglePick
          label={label}
          type={type}
          options={options}
          picked={picks[0]}
          onChange={onChange}
        />
      ) : (
        <ManyPicks options={options} picked={picks} onChange={onChange} />
      )}
    </div>
  );
}
