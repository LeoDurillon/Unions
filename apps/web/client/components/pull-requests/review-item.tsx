// One pull request under review without a ticket, on its row: its link, branches and status, Open review and Stop reviewing.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { ConfirmButton } from '../confirm-button';
import { TrashIcon } from '../icon-button';
import { Badge, Button } from '../ui';

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
    <li className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-1">
        <a
          href={review.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:text-indigo-600 hover:underline dark:hover:text-indigo-400"
        >
          {review.title}
        </a>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span>
            #{review.prNumber} by @{review.author} · added{' '}
            {new Date(review.createdAt).toLocaleString()}
          </span>
          <span className="truncate font-mono">
            {review.headBranch} → {review.baseBranch}
          </span>
          {review.submitStatus === 'sending' ? <Badge tone="blue">posting…</Badge> : null}
          {review.submitStatus === 'failed' ? <Badge tone="red">posting failed</Badge> : null}
          {review.previewStatus === 'running' ? <Badge tone="green">preview running</Badge> : null}
          {review.notionPages.length > 0 ? (
            <Badge
              tone="neutral"
              title={review.notionPages.map((page) => `Notion: ${page.title}`).join('\n')}
            >
              {review.notionPages.length > 1 ? `Notion ${review.notionPages.length}` : 'Notion'}
            </Badge>
          ) : null}
        </p>
      </div>
      <Button onClick={onOpen}>Open review</Button>
      <ConfirmButton
        label={`Stop reviewing #${review.prNumber}`}
        icon={<TrashIcon />}
        question="Stop reviewing it? Its drafts and preview are removed."
        confirmLabel="Remove"
        disabled={removing}
        onConfirm={onRemove}
      />
    </li>
  );
}
