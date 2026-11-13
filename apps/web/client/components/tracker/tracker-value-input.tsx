// A tracker field's value, by its shared type (`fieldShape` of its kind): a rule's, or one set by hand in a tab.
// Choices, typed values and templates are shared; people, picks and moves are the tracker's own parts.

import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { TrackerFieldShape } from '@union/core/tracker-field-types';
import type { ReactElement } from 'react';

import type { TrackerDraft } from '../../lib/integrations/tracker-draft';
import { TRACKER_VALUE_PARTS } from '../integrations/tracker-value-parts';
import { Field } from '../ui/ui';
import { ChoiceInput, MultiChoiceInput } from './choice-inputs';
import { PlainValueInput } from './plain-value-input';
import { TemplateInput } from './template-input';

/** The field as the input needs it: its id, name, the tracker's type and a choice's options. */
type ValueField = { id: string; name: string; type: string; options: readonly string[] };

type Props = {
  projectId: number;
  tracker: IntegrationKindName;
  field: ValueField;
  draft: TrackerDraft;
  /** A rule's value: variables are offered, and the hints say what the rule checks when it runs. */
  variables: boolean;
  /** Where the item's moves are read, for a status set by hand; null: not here. */
  movesUrl?: string | null;
  onChange: (draft: TrackerDraft) => void;
};

/** A typed value as the user reads it. */
function textOf(shape: TrackerFieldShape, value: string): string {
  if (shape.type === 'checkbox') {
    return value === 'true' ? 'Yes' : 'No';
  }
  return value.trim();
}

/** Free text in a rule, else the input its type takes; a choice without listed options is typed by name. */
function TypedValue({
  shape,
  field,
  draft,
  variables,
  set,
}: Pick<Props, 'field' | 'draft' | 'variables'> & {
  shape: TrackerFieldShape;
  set: (value: string) => void;
}): ReactElement {
  const label = `${field.name || 'Field'} value`;
  if (variables) {
    return (
      <TemplateInput
        value={draft.value}
        placeholder={shape.placeholder}
        label={label}
        variables={shape.variables}
        multiline={shape.type === 'textarea'}
        onChange={set}
      />
    );
  }
  const listed =
    shape.type === 'select' || shape.type === 'multi_select' || shape.type === 'labels';
  return (
    <PlainValueInput
      type={listed ? 'text' : shape.type}
      value={draft.value}
      label={label}
      onChange={set}
    />
  );
}

function SharedValue(props: Props & { shape: TrackerFieldShape }): ReactElement {
  const { shape, tracker, field, draft, variables, onChange } = props;
  const set = (value: string): void => {
    onChange({ value, picks: [], text: textOf(shape, value) });
  };
  const hint = (variables ? shape.ruleHint : shape.handHint) ?? undefined;
  const choice = {
    options: field.options,
    newOptions: shape.newOptions,
    variables: variables && shape.variables,
    tracker: integrationKind(tracker).label,
    value: draft.value,
    onChange: set,
  };
  if (shape.type === 'multi_select' && field.options.length > 0) {
    return (
      <div className="space-y-1">
        <MultiChoiceInput key={field.id} {...choice} />
        {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
      </div>
    );
  }
  return (
    <Field label="Value" hint={hint} labelHidden={!variables}>
      {shape.type === 'select' && field.options.length > 0 ? (
        <ChoiceInput key={field.id} {...choice} />
      ) : (
        <TypedValue shape={shape} field={field} draft={draft} variables={variables} set={set} />
      )}
    </Field>
  );
}

/** The input the field's shared type takes; null for a field Union cannot set. */
export function TrackerValueInput(props: Props): ReactElement | null {
  const { projectId, tracker, field, draft, variables, movesUrl = null, onChange } = props;
  const shape = integrationKind(tracker).fieldShape(field.type);
  const { People, Picked, Move } = TRACKER_VALUE_PARTS[tracker];
  if (!shape) {
    return null;
  }
  if (shape.type === 'move') {
    return Move && movesUrl !== null ? (
      <Move url={movesUrl} draft={draft} onChange={onChange} />
    ) : null;
  }
  if (shape.type === 'people') {
    return People ? (
      <People
        projectId={projectId}
        value={draft.value}
        onChange={(value, text) => {
          onChange({ value, picks: [], text });
        }}
      />
    ) : null;
  }
  if (shape.type === 'picked') {
    const hint = (variables ? shape.ruleHint : shape.handHint) ?? undefined;
    return Picked ? (
      <Field label="Value" hint={hint} labelHidden={!variables}>
        <Picked
          projectId={projectId}
          label={`${field.name} value`}
          type={field.type}
          picks={draft.picks}
          onChange={(picks) => {
            const names = picks.map((pick) => pick.name).join(', ');
            onChange({ value: names, picks, text: names });
          }}
        />
      </Field>
    ) : null;
  }
  return <SharedValue {...props} shape={shape} />;
}
