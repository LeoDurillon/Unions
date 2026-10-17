// The pull requests of a stack under review as tabs, bottom first: the picked one is reviewed below, each shows its drafts.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useDraftCounts } from '../../lib/use-review';
import { Badge } from '../ui';

function Status({ review }: { review: CurrentReview }): ReactElement | null {
  if (review.submitStatus === 'sending') {
    return <Badge tone="blue">posting…</Badge>;
  }
  return review.submitStatus === 'failed' ? <Badge tone="red">failed</Badge> : null;
}

export function StackTabs({
  projectId,
  stack,
  current,
  onPick,
}: {
  projectId: number;
  stack: CurrentReview[];
  current: number;
  onPick: (number: number) => void;
}): ReactElement {
  const drafts = useDraftCounts(
    stack.map((review) => ({
      target: { kind: 'pull-request', projectId, number: review.prNumber },
      posting: review.submitStatus === 'sending',
    })),
  );
  return (
    <div
      role="tablist"
      aria-label="Pull requests of the stack"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {stack.map((review, index) => {
        const count = drafts[index] ?? 0;
        return (
          <button
            key={review.prNumber}
            type="button"
            role="tab"
            aria-selected={review.prNumber === current}
            title={review.title}
            onClick={() => {
              onPick(review.prNumber);
            }}
            className={`flex max-w-64 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${review.prNumber === current ? 'border-indigo-600 font-medium' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
          >
            <span className="shrink-0">#{review.prNumber}</span>
            <span className="truncate">{review.title}</span>
            <span className="flex shrink-0 gap-1">
              {count > 0 ? <Badge tone="amber">{count}</Badge> : null}
              <Status review={review} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
