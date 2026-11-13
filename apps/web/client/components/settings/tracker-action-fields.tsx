// A tracker action's fields in the rule editor: its tracker's status or fields editor, or the comment to post.
import type { NotionSchema } from '@union/core';
import type { EventAction } from '@union/core/event-actions';
import type { TrackerAction, TrackerActionOf } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

import { TRACKER_RULE_EDITORS } from '../integrations/tracker-rule-editors';
import { Field, inputClass } from '../ui/ui';
import { VariableChips } from './variable-chips';

const COMMENT_ROWS = 4;

function CommentField({
  action,
  onChange,
}: {
  action: TrackerActionOf<'tracker_comment'>;
  onChange: (action: EventAction) => void;
}): ReactElement {
  return (
    <Field label="Comment (plain text; links become links, variables are filled in when it is sent)">
      <textarea
        className={inputClass}
        rows={COMMENT_ROWS}
        value={action.body}
        placeholder="Ready for QA: {pr.url}"
        onChange={(event) => {
          onChange({ ...action, body: event.target.value });
        }}
      />
      <VariableChips
        onPick={(variable) => {
          onChange({ ...action, body: `${action.body}${variable}` });
        }}
      />
    </Field>
  );
}

export function TrackerActionFields({
  projectId,
  notion,
  action,
  onChange,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: TrackerAction;
  onChange: (action: EventAction) => void;
}): ReactElement | null {
  const editor = TRACKER_RULE_EDITORS[action.tracker];
  if (action.kind === 'tracker_comment') {
    return <CommentField action={action} onChange={onChange} />;
  }
  if (action.kind === 'tracker_fields') {
    return (
      <editor.Fields projectId={projectId} notion={notion} action={action} onChange={onChange} />
    );
  }
  return editor.Status ? (
    <editor.Status projectId={projectId} notion={notion} action={action} onChange={onChange} />
  ) : null;
}
