// "Not useful" on an item of what needs the reviewer: hides it from the report and, with a rule, keeps
// the rule as a lesson of the project's spec reports, so the next ones stop raising that kind of item.
import type { AttentionItem } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { ReviewTarget } from '../../lib/review-target';
import { useReviewReport } from '../../lib/use-review-report';
import { Button, ErrorText, inputClass } from '../ui';

/** A first draft of the rule, for the reviewer to widen to the kind of item. */
function draftRule(item: AttentionItem): string {
  return `Do not raise "${item.title}" as needing the reviewer.`;
}

function NotUsefulForm({
  target,
  index,
  item,
  onClose,
}: {
  target: ReviewTarget;
  index: number;
  item: AttentionItem;
  onClose: () => void;
}): ReactElement {
  const [rule, setRule] = useState(draftRule(item));
  const { notUseful } = useReviewReport(target);
  return (
    <div className="space-y-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-800/50">
      <label className="block space-y-1">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          A rule for this project&rsquo;s next spec reports (Memory page, Spec report). Make it
          about the kind of item, or clear it to only hide this one.
        </span>
        <textarea
          rows={2}
          value={rule}
          className={inputClass}
          onChange={(event) => {
            setRule(event.target.value);
          }}
        />
      </label>
      <ErrorText error={notUseful.error} />
      <div className="flex gap-2">
        <Button
          disabled={notUseful.isPending}
          onClick={() => {
            notUseful.mutate({ index, rule });
          }}
        >
          {rule.trim() === '' ? 'Hide it' : 'Hide it and keep the rule'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The button, then the form it opens. */
export function NotUseful({
  target,
  index,
  item,
}: {
  target: ReviewTarget;
  index: number;
  item: AttentionItem;
}): ReactElement {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <NotUsefulForm
        target={target}
        index={index}
        item={item}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      title="Hide this item, and keep a rule so the next reports stop raising it"
      className="shrink-0 text-xs text-zinc-500 hover:underline"
      onClick={() => {
        setOpen(true);
      }}
    >
      Not useful
    </button>
  );
}
