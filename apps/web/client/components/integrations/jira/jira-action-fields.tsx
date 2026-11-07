// A Jira action's fields in the rule editor: the status to move to, the fields to set, or the comment.
import type { JiraRuleSource } from '@union/core';
import type { ActionKind, EventAction } from '@union/core/event-actions';
import type { JiraFieldValue } from '@union/core/jira-field-types';
import type { ReactElement } from 'react';

import { useJiraRuleSource } from '../../../lib/jira-rule-source';
import { VariableChips } from '../../settings/variable-chips';
import { Button, Field, inputClass } from '../../ui';
import { JiraFieldRow } from './jira-field-row';

type Action<K extends ActionKind> = Extract<EventAction, { kind: K }>;
type JiraAction = Action<'jira_transition' | 'jira_field' | 'jira_comment'>;

const EMPTY_FIELD: JiraFieldValue = { fieldId: '', fieldName: '', fieldType: 'text', value: '' };
const COMMENT_ROWS = 4;

function StatusField({
  source,
  action,
  onChange,
}: {
  source: JiraRuleSource;
  action: Action<'jira_transition'>;
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
  action: Action<'jira_field'>;
  onChange: (action: EventAction) => void;
}): ReactElement {
  if (source.fields.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Union has not read the Jira fields yet: click Refresh from Jira above.
      </p>
    );
  }
  const set = (values: JiraFieldValue[]): void => {
    onChange({ ...action, values });
  };
  return (
    <div className="space-y-2">
      {action.values.map((entry, index) => (
        <JiraFieldRow
          key={entry.fieldId}
          projectId={projectId}
          fields={source.fields}
          entry={entry}
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

function CommentField({
  action,
  onChange,
}: {
  action: Action<'jira_comment'>;
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

export function JiraActionFields({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: JiraAction;
  onChange: (action: EventAction) => void;
}): ReactElement {
  const source = useJiraRuleSource(projectId);
  if (!source) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Connect the project to Jira first (Settings → Integrations → Jira).
      </p>
    );
  }
  if (action.kind === 'jira_transition') {
    return <StatusField source={source} action={action} onChange={onChange} />;
  }
  if (action.kind === 'jira_field') {
    return <FieldRows projectId={projectId} source={source} action={action} onChange={onChange} />;
  }
  return <CommentField action={action} onChange={onChange} />;
}
