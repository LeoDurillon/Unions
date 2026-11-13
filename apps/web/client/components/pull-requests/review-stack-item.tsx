// A stack of pull requests under review as one card: its bottom's title, its pull requests, opening and removing it
// whole.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { Badge } from '../ui/ui';
import { ReviewCardActions } from './review-item';
import { StackTrackerBadges } from './review-tracker-badges';

/** `stack` is bottom first; Open review opens its bottom pull request. */
export function ReviewStackItem({
  stack,
  removing,
  onOpen,
  onRemove,
}: {
  stack: CurrentReview[];
  removing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}): ReactElement {
  const [bottom] = stack;
  const posting = stack.some((review) => review.submitStatus === 'sending');
  const failed = stack.some((review) => review.submitStatus === 'failed');
  const previewing = stack.some((review) => review.previewStatus === 'running');
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="truncate font-mono text-[11px] text-zinc-500">
        {stack.map((review) => `#${review.prNumber}`).join(' → ')} → {bottom?.baseBranch}
      </p>
      <p className="line-clamp-2 text-[13px] font-semibold">{bottom?.title}</p>
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">stack of {stack.length}</Badge>
          {posting ? <Badge tone="blue">posting…</Badge> : null}
          {failed ? <Badge tone="red">posting failed</Badge> : null}
          {previewing ? <Badge tone="green">preview running</Badge> : null}
          <StackTrackerBadges stack={stack} />
        </p>
      </div>
      <ReviewCardActions
        label="Stop reviewing the stack"
        question="Stop reviewing the whole stack? Its drafts and previews are removed."
        removing={removing}
        onRemove={onRemove}
        onOpen={onOpen}
      />
    </li>
  );
}
