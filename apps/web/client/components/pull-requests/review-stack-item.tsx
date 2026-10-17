// A stack of pull requests under review as one row: its bottom's title, its pull requests, opening and removing it whole.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { Badge, Button } from '../ui';

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
  return (
    <li className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <Badge tone="neutral">stack of {stack.length}</Badge>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{bottom?.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span>{stack.map((review) => `#${review.prNumber}`).join(' → ')}</span>
          <span className="truncate font-mono">→ {bottom?.baseBranch}</span>
          {posting ? <Badge tone="blue">posting…</Badge> : null}
          {failed ? <Badge tone="red">posting failed</Badge> : null}
        </p>
      </div>
      <Button variant="primary" onClick={onOpen}>
        Open review
      </Button>
      <Button disabled={removing} onClick={onRemove}>
        Remove stack
      </Button>
    </li>
  );
}
