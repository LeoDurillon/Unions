// The pull requests of a stack under review as a segmented control, bottom first: the picked one is reviewed below, each shows its drafts.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { useDraftCounts } from '../../lib/use-review';
import { Segmented } from '../choice';
import { Badge } from '../ui';

function Status({ review }: { review: CurrentReview }): ReactElement | null {
  if (review.submitStatus === 'sending') {
    return <Badge tone="blue">posting…</Badge>;
  }
  return review.submitStatus === 'failed' ? <Badge tone="red">failed</Badge> : null;
}

/** `#1617`, its drafts when there are some, and where its posting stands. */
function PullLabel({ review, drafts }: { review: CurrentReview; drafts: number }): ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      #{review.prNumber}
      {drafts > 0 ? (
        <span className="text-amber-700 dark:text-amber-400" aria-label={`${drafts} drafts`}>
          {drafts}
        </span>
      ) : null}
      <Status review={review} />
    </span>
  );
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
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="shrink-0 text-xs text-zinc-500">Stack of {stack.length}</span>
      <Segmented
        legend="Pull requests of the stack, bottom first"
        size="sm"
        value={String(current)}
        onChange={(value) => {
          onPick(Number(value));
        }}
        options={stack.map((review, index) => ({
          value: String(review.prNumber),
          title: review.title,
          label: <PullLabel review={review} drafts={drafts[index] ?? 0} />,
        }))}
      />
    </div>
  );
}
