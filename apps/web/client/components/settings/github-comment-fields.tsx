// A GitHub comment action's fields: the issue or the pull request, and the comment as a template.
import {
  COMMENT_TARGET_LABELS,
  COMMENT_TARGETS,
  type GitHubCommentAction,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { Field, inputClass } from '../ui';
import { VariableChips } from './variable-chips';

/** Rows of the comment box: a few lines show without scrolling. */
const COMMENT_ROWS = 4;

export function GitHubCommentFields({
  action,
  onChange,
}: {
  action: GitHubCommentAction;
  onChange: (action: GitHubCommentAction) => void;
}): ReactElement {
  return (
    <>
      <Field label="Comment on">
        <select
          className={inputClass}
          value={action.on}
          onChange={(event) => {
            const on = COMMENT_TARGETS.find((target) => target === event.target.value);
            if (on) {
              onChange({ ...action, on });
            }
          }}
        >
          {COMMENT_TARGETS.map((target) => (
            <option key={target} value={target}>
              {COMMENT_TARGET_LABELS[target]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Comment (Markdown; variables are filled in when it is sent)">
        <textarea
          className={`${inputClass} font-mono`}
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
    </>
  );
}
