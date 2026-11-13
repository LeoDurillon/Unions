// One pull request under review without a ticket, as a card. It shows its number, branches, title (a link) and
// status, when it was added, Stop reviewing and Open review.
import type { ReactElement, ReactNode } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { formatWhen } from '../../lib/ui/relative-time';
import { ConfirmButton } from '../ui/confirm-button';
import { TrashIcon } from '../ui/icon-button';
import { Badge, Button } from '../ui/ui';
import { ReviewTrackerBadges } from './review-tracker-badges';

/** The foot of a review's card: what it says (when added, by whom), Stop reviewing (asks first) and Open review. */
export function ReviewCardActions({
  label,
  question,
  removing,
  onRemove,
  onOpen,
  children = null,
}: {
  label: string;
  question: string;
  removing: boolean;
  onRemove: () => void;
  onOpen: () => void;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="mt-auto flex items-center gap-2 pt-1">
      <span className="flex-1 truncate text-xs text-zinc-500">{children}</span>
      <ConfirmButton
        label={label}
        icon={<TrashIcon />}
        question={question}
        confirmLabel="Remove"
        disabled={removing}
        onConfirm={onRemove}
      />
      <Button variant="primary" size="sm" className="py-1" onClick={onOpen}>
        Open review
      </Button>
    </div>
  );
}

export function ReviewItem({
  review,
  removing,
  onOpen,
  onRemove,
}: {
  review: CurrentReview;
  removing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="truncate font-mono text-[11px] text-zinc-500">
        #{review.prNumber} · {review.headBranch} → {review.baseBranch}
      </p>
      <a
        href={review.url}
        target="_blank"
        rel="noreferrer"
        className="line-clamp-2 text-[13px] font-semibold hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
      >
        {review.title}
      </a>
      <p className="flex flex-wrap items-center gap-1.5 empty:hidden">
        {review.submitStatus === 'sending' ? <Badge tone="blue">posting…</Badge> : null}
        {review.submitStatus === 'failed' ? <Badge tone="red">posting failed</Badge> : null}
        {review.previewStatus === 'running' ? <Badge tone="green">preview running</Badge> : null}
        <ReviewTrackerBadges review={review} />
      </p>
      <ReviewCardActions
        label={`Stop reviewing #${review.prNumber}`}
        question="Stop reviewing it? Its drafts and preview are removed."
        removing={removing}
        onRemove={onRemove}
        onOpen={onOpen}
      >
        added {formatWhen(review.createdAt)} · by @{review.author}
      </ReviewCardActions>
    </li>
  );
}
