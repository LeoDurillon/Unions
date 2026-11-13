// The rule editor's "Then": the kinds of action the project can use (a tracker's only once it is connected).

import {
  choiceKey,
  choiceLabel,
  choiceOf,
  emptyAction,
  type EventAction,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { useOfferedActionChoices } from '../../lib/settings/offered-action-kinds';
import { Field, inputClass } from '../ui/ui';

export function ActionKindSelect({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: EventAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  const choices = useOfferedActionChoices(projectId, choiceOf(action));
  return (
    <Field label="Then">
      <select
        className={inputClass}
        value={choiceKey(choiceOf(action))}
        onChange={(event) => {
          // Another choice holds other fields: it starts empty.
          const picked = choices.find((choice) => choiceKey(choice) === event.target.value);
          if (picked) {
            onChange(emptyAction(picked));
          }
        }}
      >
        {choices.map((choice) => (
          <option key={choiceKey(choice)} value={choiceKey(choice)}>
            {choiceLabel(choice)}
          </option>
        ))}
      </select>
    </Field>
  );
}
