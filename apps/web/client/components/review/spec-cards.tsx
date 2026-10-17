// The specs an agent review will check the change against: one card each, its text to read or edit, the pull requests of a stack it covers.
import type { AgentReviewSpec } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { StackPull } from '../../lib/review-stack';
import { Button, inputClass } from '../ui';
import { LABELS } from './spec-picker';

/** Characters of a closed card's text shown as its preview. */
const PREVIEW_CHARS = 240;

/** Which pull requests of the stack implement the spec: a box each. */
function PullBoxes({
  spec,
  members,
  onChange,
}: {
  spec: AgentReviewSpec;
  members: StackPull[];
  onChange: (spec: AgentReviewSpec) => void;
}): ReactElement {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <legend className="sr-only">Pull requests that implement {spec.label}</legend>
      <span className="text-zinc-500">Implemented by</span>
      {members.map((pull) => (
        <label key={pull.number} title={pull.title} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={spec.prs.includes(pull.number)}
            onChange={(event) => {
              const prs = event.target.checked
                ? [...spec.prs, pull.number]
                : spec.prs.filter((number) => number !== pull.number);
              onChange({ ...spec, prs });
            }}
          />
          #{pull.number}
        </label>
      ))}
    </fieldset>
  );
}

function SpecCard({
  spec,
  members,
  onChange,
  onRemove,
}: {
  spec: AgentReviewSpec;
  members: StackPull[] | null;
  onChange: (spec: AgentReviewSpec) => void;
  onRemove: () => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={spec.label}>
          {spec.label}
        </span>
        <span className="text-xs text-zinc-500">{LABELS[spec.kind]}</span>
        <Button
          onClick={() => {
            setEditing(!editing);
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </Button>
        <Button onClick={onRemove}>Remove</Button>
      </div>
      {members ? <PullBoxes spec={spec} members={members} onChange={onChange} /> : null}
      {editing ? (
        <textarea
          aria-label={`Text of ${spec.label}`}
          className={`${inputClass} h-56 font-mono text-xs`}
          value={spec.text}
          onChange={(event) => {
            onChange({ ...spec, text: event.target.value });
          }}
        />
      ) : (
        <p className="line-clamp-3 text-xs whitespace-pre-wrap text-zinc-500">
          {spec.text.slice(0, PREVIEW_CHARS)}
        </p>
      )}
    </li>
  );
}

/** A spec in the dialog, with a key of its own: the same source can be added twice. */
export type SpecItem = { key: string; spec: AgentReviewSpec };

let lastKey = 0;

export function specItem(spec: AgentReviewSpec): SpecItem {
  lastKey += 1;
  return { key: String(lastKey), spec };
}

/** The specs in order; none means the agent reviews the code alone. `members`: a stack's pull requests. */
export function SpecCards({
  items,
  members,
  onChange,
}: {
  items: SpecItem[];
  members: StackPull[] | null;
  onChange: (items: SpecItem[]) => void;
}): ReactElement {
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No spec: the agent reviews the code alone. Add one to have the change checked against it.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <SpecCard
          key={item.key}
          spec={item.spec}
          members={members}
          onChange={(spec) => {
            onChange(items.map((other) => (other.key === item.key ? { ...item, spec } : other)));
          }}
          onRemove={() => {
            onChange(items.filter((other) => other.key !== item.key));
          }}
        />
      ))}
    </ul>
  );
}
