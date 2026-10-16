// A Project fields action's fields: the item (the issue's or the pull request's), then the fields to set, a row each.
import { useQuery } from '@tanstack/react-query';
import type { GitHubProjectFieldsAction } from '@union/core/event-actions';
import {
  PROJECT_ITEM_LABELS,
  PROJECT_ITEM_TARGETS,
  settableField,
  type ProjectField,
  type ProjectFieldValue,
} from '@union/core/event-project-fields';
import type { ReactElement } from 'react';

import { eventRulesApi } from '../../lib/event-rules-api';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { ProjectFieldRow } from './project-field-row';

const EMPTY_VALUE: ProjectFieldValue = { fieldId: '', fieldName: '', fieldType: 'text', value: '' };

function ItemField({
  action,
  onChange,
}: {
  action: GitHubProjectFieldsAction;
  onChange: (action: GitHubProjectFieldsAction) => void;
}): ReactElement {
  return (
    <Field label="On the GitHub Project item of">
      <select
        className={inputClass}
        value={action.item}
        onChange={(event) => {
          const item = PROJECT_ITEM_TARGETS.find((target) => target === event.target.value);
          if (item) {
            onChange({ ...action, item });
          }
        }}
      >
        {PROJECT_ITEM_TARGETS.map((target) => (
          <option key={target} value={target}>
            {PROJECT_ITEM_LABELS[target]}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ProjectFieldsFields({
  projectId,
  action,
  onChange,
}: {
  projectId: number;
  action: GitHubProjectFieldsAction;
  onChange: (action: GitHubProjectFieldsAction) => void;
}): ReactElement {
  const fields = useQuery({
    queryKey: ['project-fields', projectId],
    queryFn: () => eventRulesApi.projectFields(projectId),
  });
  const settable = (fields.data ?? []).filter((field) => settableField(action.item, field.name));
  const used = new Set(action.values.map((entry) => entry.fieldId));
  const update = (values: ProjectFieldValue[]): void => {
    onChange({ ...action, values });
  };
  const fieldOf = (id: string): ProjectField | undefined =>
    fields.data?.find((field) => field.id === id);
  return (
    <>
      <ItemField action={action} onChange={onChange} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">The fields to set</legend>
        <ErrorText error={fields.error} />
        {action.values.map((entry, index) => (
          <ProjectFieldRow
            // Each field is set once and one row at most has none yet: a row is its field.
            key={entry.fieldId}
            choices={settable.filter((field) => field.id === entry.fieldId || !used.has(field.id))}
            field={fieldOf(entry.fieldId)}
            entry={entry}
            onChange={(next) => {
              update(action.values.map((other, at) => (at === index ? next : other)));
            }}
            onRemove={
              action.values.length > 1
                ? () => {
                    update(action.values.filter((_other, at) => at !== index));
                  }
                : null
            }
          />
        ))}
        <Button
          disabled={used.has('') || settable.every((field) => used.has(field.id))}
          onClick={() => {
            update([...action.values, EMPTY_VALUE]);
          }}
        >
          Add a field
        </Button>
      </fieldset>
    </>
  );
}
