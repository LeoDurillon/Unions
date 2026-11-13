// What a rule's Notion action sets, as the rule's sentence ends: "set Status to Done, PR to {pr.url}".
import type { NotionSchema } from '@union/core';
import type { TrackerActionOf, TrackerRuleValue } from '@union/core/event-tracker-actions';
import type { ReactElement } from 'react';

import { PeopleNames } from '../../settings/people-field';

/** The properties a rule's row names in full; the others are counted. */
const SHOWN_VALUES = 2;

function ValueText({
  projectId,
  notion,
  entry,
}: {
  projectId: number;
  notion: NotionSchema | null;
  entry: TrackerRuleValue;
}): ReactElement {
  const property = notion?.properties.find((candidate) => candidate.id === entry.fieldId);
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

export function NotionFieldsText({
  projectId,
  notion,
  action,
}: {
  projectId: number;
  notion: NotionSchema | null;
  action: TrackerActionOf<'tracker_fields'>;
}): ReactElement {
  const hidden = action.values.length - SHOWN_VALUES;
  return (
    <>
      set{' '}
      {action.values.slice(0, SHOWN_VALUES).map((entry, index) => (
        <span key={entry.fieldId}>
          {index > 0 ? ', ' : null}
          <ValueText projectId={projectId} notion={notion} entry={entry} />
        </span>
      ))}
      {hidden > 0 ? ` and ${hidden} more` : null}
    </>
  );
}
