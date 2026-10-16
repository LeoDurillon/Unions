// One change a pull request rule makes: labels, reviewers or assignees to pick, or a title or description template.
import type { PullRequestChange } from '@union/core/event-pull-request';
import type { ReactElement } from 'react';

import type { RuleChoices } from '../../../src/event-api-types';
import { Field, inputClass } from '../ui';
import { NamePicker } from './name-picker';
import { VariableChips } from './variable-chips';

/** Rows of the description box: a few lines show without scrolling. */
const DESCRIPTION_ROWS = 4;

function TemplateField({
  change,
  onChange,
}: {
  change: Extract<PullRequestChange, { kind: 'title' | 'description' }>;
  onChange: (change: PullRequestChange) => void;
}): ReactElement {
  const title = change.kind === 'title';
  const update = (value: string): void => {
    onChange({ ...change, value });
  };
  return (
    <Field
      label={title ? 'New title' : 'Section of the description (Markdown)'}
      hint={
        title
          ? undefined
          : 'Added at the end once, then replaced each time the rule runs; the rest is kept.'
      }
    >
      {title ? (
        <input
          className={`${inputClass} font-mono`}
          value={change.value}
          placeholder="[{ticket.id}] {ticket.title}"
          onChange={(event) => {
            update(event.target.value);
          }}
        />
      ) : (
        <textarea
          className={`${inputClass} font-mono`}
          rows={DESCRIPTION_ROWS}
          value={change.value}
          placeholder="Ready for QA: {pr.url}"
          onChange={(event) => {
            update(event.target.value);
          }}
        />
      )}
      <VariableChips
        onPick={(variable) => {
          update(`${change.value}${variable}`);
        }}
      />
    </Field>
  );
}

function LabelFields({
  change,
  choices,
  onChange,
}: {
  change: Extract<PullRequestChange, { kind: 'labels' }>;
  choices: RuleChoices;
  onChange: (change: PullRequestChange) => void;
}): ReactElement {
  return (
    <>
      <NamePicker
        label="Labels to add"
        names={change.add}
        choices={choices.labels.filter((label) => !change.remove.includes(label))}
        placeholder="Type or pick a label"
        onChange={(add) => {
          onChange({ ...change, add });
        }}
      />
      <NamePicker
        label="Labels to remove"
        names={change.remove}
        choices={choices.labels.filter((label) => !change.add.includes(label))}
        placeholder="Type or pick a label"
        onChange={(remove) => {
          onChange({ ...change, remove });
        }}
      />
    </>
  );
}

export function PullRequestChangeFields({
  change,
  choices,
  onChange,
}: {
  change: PullRequestChange;
  choices: RuleChoices;
  onChange: (change: PullRequestChange) => void;
}): ReactElement {
  if (change.kind === 'title' || change.kind === 'description') {
    return <TemplateField change={change} onChange={onChange} />;
  }
  if (change.kind === 'labels') {
    return <LabelFields change={change} choices={choices} onChange={onChange} />;
  }
  return (
    <NamePicker
      label={change.kind === 'reviewers' ? 'Ask for a review from' : 'Assign'}
      names={change.users}
      choices={choices.users}
      placeholder="Type or pick a GitHub login"
      onChange={(users) => {
        onChange({ ...change, users });
      }}
    />
  );
}
