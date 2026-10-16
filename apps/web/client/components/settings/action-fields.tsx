// What a rule does: the kind of action, then that kind's own fields.
import type { NotionSchema } from '@union/core';
import {
  ACTION_KINDS,
  ACTION_LABELS,
  emptyAction,
  isActionKind,
  type EventAction,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui';
import { GitHubCommentFields } from './github-comment-fields';
import { NotionActionFields } from './notion-action-fields';

export function ActionFields({
  projectId,
  notion,
  action,
  onChange,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: EventAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  return (
    <>
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
          {ACTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ACTION_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>
      {action.kind === 'notion_property' ? (
        <NotionActionFields
          projectId={projectId}
          notion={notion}
          action={action}
          onChange={onChange}
        />
      ) : (
        <GitHubCommentFields action={action} onChange={onChange} />
      )}
    </>
  );
}
