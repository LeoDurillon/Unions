// A "Notify me in Union" action's field: the message, as a template, shown under the ticket's title.
import { MAX_NOTIFICATION, type UnionNotificationAction } from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui';
import { VariableChips } from './variable-chips';

const MESSAGE_ROWS = 2;

export function UnionNotificationFields({
  action,
  onChange,
}: {
  action: UnionNotificationAction;
  onChange: (action: UnionNotificationAction) => void;
}): ReactElement {
  return (
    <Field label="Message (under the ticket's title in the bell; variables are filled in when it is sent)">
      <textarea
        className={inputClass}
        rows={MESSAGE_ROWS}
        maxLength={MAX_NOTIFICATION}
        value={action.message}
        placeholder="Ready for QA: {pr.url}"
        onChange={(event) => {
          onChange({ ...action, message: event.target.value });
        }}
      />
      <VariableChips
        onPick={(variable) => {
          onChange({ ...action, message: `${action.message}${variable}` });
        }}
      />
    </Field>
  );
}
