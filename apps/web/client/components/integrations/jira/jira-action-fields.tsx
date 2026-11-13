// The Jira editors of tracker rule actions: the status to move the ticket's issue to, the fields to set on it.

import type { JiraRuleSource } from '@union/core';
import type { EventAction } from '@union/core/event-actions';
import type { TrackerActionOf, TrackerRuleValue } from '@union/core/event-tracker-actions';
import { isJiraFieldType, type JiraFieldValue } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { useJiraRuleSource } from '../../../lib/integrations/jira-rule-source';
import { Button, Field, inputClass } from '../../ui/ui';
import { JiraFieldRow } from './jira-field-row';

type StatusAction = TrackerActionOf<'tracker_status'>;
type FieldsAction = TrackerActionOf<'tracker_fields'>;

const EMPTY_FIELD: JiraFieldValue = { fieldId: '', fieldName: '', fieldType: 'text', value: '' };

/** A stored value as the Jira rows edit it; a type Jira no longer offers reads as text. */
function jiraValue(entry: TrackerRuleValue): JiraFieldValue {
  return { ...entry, fieldType: isJiraFieldType(entry.fieldType) ? entry.fieldType : 'text' };
}

function StatusField({
  source,
  action,
  onChange,
}: {
  source: JiraRuleSource;
  action: StatusAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  if (source.statuses.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Union has not read the Jira project yet: click Refresh from Jira above.
      </p>
    );
  }
  return (
    <Field
      label="Move it to"
      hint="Through whichever transition of the issue's workflow leads there; nothing happens if it is there already."
    >
      <select
        className={inputClass}
        value={action.statusId}
        onChange={(event) => {
          const status = source.statuses.find((each) => each.id === event.target.value);
          if (status) {
            onChange({ ...action, statusId: status.id, statusName: status.name });
          }
        }}
      >
        <option value="">Pick a status</option>
        {source.statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function FieldRows({
  projectId,
  source,
  action,
  onChange,
}: {
  projectId: number;
  source: JiraRuleSource;
  action: FieldsAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  if (source.fields.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Union has not read the Jira fields yet: click Refresh from Jira above.
      </p>
    );
  }
  const set = (values: TrackerRuleValue[]): void => {
    onChange({ ...action, values });
  };
  return (
    <div className="space-y-2">
      {action.values.map((entry, index) => (
        <JiraFieldRow
          key={entry.fieldId}
          projectId={projectId}
          fields={source.fields}
          entry={jiraValue(entry)}
          onChange={(changed) => {
            set(action.values.map((each, at) => (at === index ? changed : each)));
          }}
          onRemove={() => {
            set(action.values.filter((_each, at) => at !== index));
          }}
        />
      ))}
      <Button
        // One field still to pick at a time: rows are keyed by their field.
        disabled={action.values.some((entry) => entry.fieldId === '')}
        onClick={() => {
          set([...action.values, EMPTY_FIELD]);
        }}
      >
        Add a field
      </Button>
    </div>
  );
}

/** The project's Jira statuses and fields as last read, or why there are none. */
function WithSource({
  projectId,
  children,
}: {
  projectId: number;
  children: (source: JiraRuleSource) => ReactElement;
}): ReactElement {
  const source = useJiraRuleSource(projectId);
  if (!source) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Connect the project to Jira first (Settings → Integrations → Jira).
      </p>
    );
  }
  return children(source);
}

/** "Move the ticket's Jira issue": the status to move it to. */
export function JiraStatusEditor({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: StatusAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  return (
    <WithSource projectId={projectId}>
      {(source) => <StatusField source={source} action={action} onChange={onChange} />}
    </WithSource>
  );
}

/** "Set fields of the ticket's Jira issue": a row per field. */
export function JiraFieldsEditor({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: FieldsAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  return (
    <WithSource projectId={projectId}>
      {(source) => (
        <FieldRows projectId={projectId} source={source} action={action} onChange={onChange} />
      )}
    </WithSource>
  );
}
