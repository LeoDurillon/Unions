// The rule editor's "Then": the kinds of action the project can use (a tracker's only once it is connected).

import {
  ACTION_LABELS,
  emptyAction,
  isActionKind,
  type EventAction,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { useOfferedActionKinds } from '../../lib/settings/offered-action-kinds';
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
  const kinds = useOfferedActionKinds(projectId, action.kind);
  return (
    <Field label="Then">
      <select
        className={inputClass}
        value={action.kind}
        onChange={(event) => {
          // Another kind holds other fields: it starts empty.
          if (isActionKind(event.target.value)) {
            onChange(emptyAction(event.target.value));
          }
        }}
      >
        {kinds.map((kind) => (
          <option key={kind} value={kind}>
            {ACTION_LABELS[kind]}
          </option>
        ))}
      </select>
    </Field>
  );
}
