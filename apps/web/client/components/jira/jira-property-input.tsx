// The new value of a Jira issue's field in its tab: the rule editor's input without variables, or a move for the status.

import type { TrackerProperty } from '@union/core';
import { isJiraFieldType } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import type { TrackerDraft } from '../../lib/integrations/tracker-draft';
import { JiraValueField } from '../integrations/jira/jira-value-field';
import { JiraStatusInput } from './jira-status-input';

export function JiraPropertyInput({
  transitionsUrl,
  projectId,
  property,
  draft,
  onChange,
}: {
  /** Where the issue's moves are read; null: the status is not edited here. */
  transitionsUrl: string | null;
  projectId: number;
  property: TrackerProperty;
  draft: TrackerDraft;
  onChange: (draft: TrackerDraft) => void;
}): ReactElement | null {
  if (property.id === 'status') {
    // A move starts unpicked: the issue's status is where it moves from.
    return transitionsUrl === null ? null : (
      <JiraStatusInput url={transitionsUrl} draft={draft} onChange={onChange} />
    );
  }
  if (!isJiraFieldType(property.type)) {
    return null;
  }
  return (
    <JiraValueField
      projectId={projectId}
      entry={{
        fieldId: property.id,
        fieldName: property.name,
        fieldType: property.type,
        value: draft.value,
        picks: draft.picks,
      }}
      variables={false}
      onChange={(entry) => {
        const picks = entry.picks ?? [];
        onChange({ value: entry.value, picks, text: entry.value });
      }}
    />
  );
}
