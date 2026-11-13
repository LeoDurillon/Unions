// What a rule does, in a sentence for its row: what it does on a tracker, where it comments,
// what it notifies. It can also say what it changes on the pull request or its Project item.
import type { NotionSchema } from '@union/core';
import { COMMENT_TARGET_LABELS, type EventAction } from '@union/core/event-actions';
import { describeChange } from '@union/core/event-pull-request';
import type { ReactElement } from 'react';

import { TrackerActionText } from './tracker-action-text';

export function ActionText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: EventAction;
}): ReactElement {
  if ('tracker' in action) {
    return <TrackerActionText projectId={projectId} notion={notion} action={action} />;
  }
  if (action.kind === 'github_pull_request') {
    return (
      <>
        update the pull request:{' '}
        {action.changes
          .map((change) => describeChange(change, change.kind === 'title' ? change.value : ''))
          .join('; ')}
      </>
    );
  }
  if (action.kind === 'github_project_fields') {
    return (
      <>
        set on the {action.item === 'issue' ? "issue's" : "pull request's"} Project item:{' '}
        {action.values
          .map((entry) => `${entry.fieldName} to ${entry.value === '' ? '(empty)' : entry.value}`)
          .join(', ')}
      </>
    );
  }
  if (action.kind === 'union_notification') {
    return (
      <>
        notify you in Union: <code className="font-mono">{action.message}</code>
      </>
    );
  }
  return (
    <>
      comment on {COMMENT_TARGET_LABELS[action.on].toLowerCase()}:{' '}
      <code className="font-mono">{action.body}</code>
    </>
  );
}
