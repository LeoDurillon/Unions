// The specs of a Review with agent, editable, a way to add one from any source, and the start.
import type { AgentReviewSpec, SpecSource } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { StackPull } from '../../lib/review-stack';
import type { ReviewTarget } from '../../lib/review-target';
import { useAgentReview } from '../../lib/use-agent-review';
import { Button, ErrorText } from '../ui';
import { SpecCards, specItem, type SpecItem } from './spec-cards';
import { SourcePicker, SpecLoader, useSpecLoad } from './spec-picker';

/** A spec for one change: the pull requests a stack's boxes picked do not apply. */
function withoutPulls(spec: AgentReviewSpec): AgentReviewSpec {
  return { kind: spec.kind, label: spec.label, text: spec.text, prs: [] };
}

/** Adds a spec from any source the review can read: the user picks it, Union reads it. */
function AddSpec({
  target,
  sources,
  onAdd,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  onAdd: (spec: { kind: SpecSource; label: string; text: string }) => void;
}): ReactElement {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<SpecSource>(sources[0] ?? 'issue');
  const load = useSpecLoad(target, (found) => {
    onAdd({ kind, label: found.label, text: found.text });
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

/**
 * The specs, editable, and Start: they are sent as they are when the user starts. `members`: the
 * stack reviewed in one run; a spec added then is linked to all of it until unticked.
 */
export function SpecsForm({
  target,
  sources,
  initial,
  members,
  onClose,
}: {
  target: ReviewTarget;
  sources: SpecSource[];
  initial: AgentReviewSpec[];
  members: StackPull[] | null;
  onClose: () => void;
}): ReactElement {
  const [items, setItems] = useState<SpecItem[]>(() => initial.map((spec) => specItem(spec)));
  const { start } = useAgentReview(target);
  const blank = items.some((item) => item.spec.text.trim() === '');
  const numbers = members?.map((pull) => pull.number) ?? [];
  return (
    <div className="space-y-4">
      <SpecCards items={items} members={members} onChange={setItems} />
      <AddSpec
        target={target}
        sources={sources}
        onAdd={(spec) => {
          setItems([...items, specItem({ ...spec, prs: numbers })]);
        }}
      />
      <ErrorText error={start.error} />
      <div className="flex items-center justify-end gap-2">
        {blank ? <span className="text-xs text-zinc-500">A spec has no text.</span> : null}
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={blank || start.isPending}
          onClick={() => {
            const specs = items.map((item) => (members ? item.spec : withoutPulls(item.spec)));
            start.mutate(members ? { specs, stack: numbers } : { specs }, { onSuccess: onClose });
          }}
        >
          {members ? `Review the ${members.length} pull requests` : 'Start the review'}
        </Button>
      </div>
    </div>
  );
}
