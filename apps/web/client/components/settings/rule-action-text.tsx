// What a rule does, in a sentence for its row: the Notion property it sets, or where it comments.
import type { NotionSchema } from '@union/core';
import {
  COMMENT_TARGET_LABELS,
  type EventAction,
  type NotionPropertyAction,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { PeopleNames } from './people-field';

function NotionText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: NotionPropertyAction;
}): ReactElement {
  const property = notion?.properties.find((candidate) => candidate.id === action.propertyId);
  return (
    <>
      set{' '}
      {property ? (
        <span className="font-medium">{property.name}</span>
      ) : (
        <span className="text-red-600 dark:text-red-400">a property no longer in Notion</span>
      )}{' '}
      to{' '}
      {property?.type === 'people' ? (
        <PeopleNames projectId={projectId} value={action.value} />
      ) : (
        <code className="font-mono">{action.value || '(empty)'}</code>
      )}
    </>
  );
}

export function ActionText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: EventAction;
}): ReactElement {
  if (action.kind === 'notion_property') {
    return <NotionText projectId={projectId} notion={notion} action={action} />;
  }
  return (
    <>
      comment on {COMMENT_TARGET_LABELS[action.on].toLowerCase()}:{' '}
      <code className="font-mono">{action.body}</code>
    </>
  );
}
