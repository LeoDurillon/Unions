// The review's specs to edit, saved on the review for Review with agent, Explain and Group by spec:
// each one's text (edited, or its source's), removing one, adding one from any source.
import type { SavedSpecEntry, SpecSource } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { ReviewSpecView } from '../../../src/review-spec-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useReviewSpecs } from '../../lib/use-review-specs';
import { Button, Dialog, ErrorText } from '../ui';
import { SourcePicker, SpecLoader, useSpecLoad, type SpecDraft } from './spec-picker';
import { SpecRow, type SpecItem } from './spec-row';

let lastKey = 0;

function itemOf(view: ReviewSpecView): SpecItem {
  lastKey += 1;
  return { ...view, key: String(lastKey) };
}

/** Adds a spec from any source the review can read: the user picks it, Union reads it once to check. */
function AddSpec({
  target,
  sources,
  onAdd,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  onAdd: (spec: SpecDraft) => void;
}): ReactElement {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<SpecSource>(sources[0] ?? 'issue');
  const load = useSpecLoad(target, (found) => {
    onAdd(found);
    setAdding(false);
  });
  if (!adding) {
    return (
      <Button
        onClick={() => {
          load.reset();
          setAdding(true);
        }}
      >
        Add a spec
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <SourcePicker
        sources={sources}
        kind={kind}
        onPick={(next) => {
          setKind(next);
          load.reset();
        }}
      />
      <SpecLoader key={kind} kind={kind} loaded={false} load={load} />
      <Button
        onClick={() => {
          setAdding(false);
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

/** A source already in the list (removed ones too) comes back instead of being added twice. */
function added(items: SpecItem[], found: SpecDraft): SpecItem[] {
  const ref = found.ref === '' ? null : found.ref;
  const same = items.find(
    (item) => item.kind === found.kind && (item.ref === ref || item.label === found.label),
  );
  if (same) {
    return items.map((item) => (item === same ? { ...item, removed: false } : item));
  }
  const view: ReviewSpecView = {
    kind: found.kind,
    ref,
    label: found.label,
    url: found.url ?? null,
    text: null,
    removed: false,
    current: found.text,
    error: null,
  };
  return [...items, itemOf(view)];
}

function savedOf(item: SpecItem): SavedSpecEntry {
  const { kind, ref, label, url, text, removed } = item;
  return { kind, ref, label, url, text, removed };
}

/** The specs kept (removed ones are only sent back on save). */
function SpecList({
  items,
  onChange,
}: {
  items: SpecItem[];
  onChange: (key: string, next: Partial<SpecItem>) => void;
}): ReactElement {
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No spec: the agents read the change alone. Add one to have it checked against it.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <SpecRow
          key={item.key}
          item={item}
          onChange={(next) => {
            onChange(item.key, next);
          }}
        />
      ))}
    </ul>
  );
}

function SpecsForm({
  target,
  sources,
  initial,
  onClose,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  initial: ReviewSpecView[];
  onClose: () => void;
}): ReactElement {
  const { save } = useReviewSpecs(target);
  const [items, setItems] = useState(() => initial.map((view) => itemOf(view)));
  const shown = items.filter((item) => !item.removed);
  const change = (key: string, next: Partial<SpecItem>): void => {
    setItems(items.map((item) => (item.key === key ? { ...item, ...next } : item)));
  };
  return (
    <div className="space-y-4">
      <SpecList items={shown} onChange={change} />
      <AddSpec
        target={target}
        sources={sources}
        onAdd={(found) => {
          setItems(added(items, found));
        }}
      />
      <ErrorText error={save.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={() => {
            save.mutate(
              items.map((item) => savedOf(item)),
              { onSuccess: onClose },
            );
          }}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/** The review's specs to edit; saved for everyone opening the review, and for its next agent runs. */
export function SpecsDialog({
  target,
  sources,
  onClose,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  onClose: () => void;
}): ReactElement {
  const { list } = useReviewSpecs(target);
  return (
    <Dialog open onClose={onClose} title="Specs of this review" wide>
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Review with agent, Explain and Group by spec check the change against these. A spec you do
          not edit is read again from its source each time; an edited one keeps your text.
        </p>
        <ErrorText error={list.error} />
        {list.data ? (
          <SpecsForm target={target} sources={sources} initial={list.data} onClose={onClose} />
        ) : (
          <p className="text-sm text-zinc-500">Reading the specs…</p>
        )}
      </div>
    </Dialog>
  );
}
