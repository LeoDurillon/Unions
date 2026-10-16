// What a rule does, in a sentence for its row: the Notion properties it sets, where it comments, or what it notifies.
import type { NotionSchema } from '@union/core';
import {
  COMMENT_TARGET_LABELS,
  type EventAction,
  type NotionPropertyAction,
  type NotionValue,
} from '@union/core/event-actions';
import type { ReactElement } from 'react';

import { PeopleNames } from './people-field';

/** The properties a rule's row names in full; the others are counted. */
const SHOWN_VALUES = 2;

function ValueText({
  projectId,
  notion,
  entry,
}: {
  projectId: number;
  notion: NotionSchema | null;
  entry: NotionValue;
}): ReactElement {
  const property = notion?.properties.find((candidate) => candidate.id === entry.propertyId);
  return (
    <>
      {property ? (
        <span className="font-medium">{property.name}</span>
      ) : (
        <span className="text-red-600 dark:text-red-400">a property no longer in Notion</span>
      )}{' '}
      to{' '}
      {property?.type === 'people' ? (
        <PeopleNames projectId={projectId} value={entry.value} />
      ) : (
        <code className="font-mono">{entry.value === '' ? '(empty)' : entry.value}</code>
      )}
    </>
  );
}

function NotionText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: NotionPropertyAction;
}): ReactElement {
  const hidden = action.values.length - SHOWN_VALUES;
  return (
    <>
      set{' '}
      {action.values.slice(0, SHOWN_VALUES).map((entry, index) => (
        <span key={entry.propertyId}>
          {index > 0 ? ', ' : null}
          <ValueText projectId={projectId} notion={notion} entry={entry} />
        </span>
      ))}
      {hidden > 0 ? ` and ${hidden} more` : null}
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
