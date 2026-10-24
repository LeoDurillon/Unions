// A stack of pull requests under review as one row: its bottom's title, its pull requests, opening and removing it whole.
import type { ReactElement } from 'react';

import type { CurrentReview } from '../../../src/api-types';
import { ConfirmButton } from '../confirm-button';
import { TrashIcon } from '../icon-button';
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
  const previewing = stack.some((review) => review.previewStatus === 'running');
  const linked = stack.filter((review) => review.notionTitle !== null);
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
          {previewing ? <Badge tone="green">preview running</Badge> : null}
          {linked.length > 0 ? (
            <Badge
              tone="neutral"
              title={linked
                .map((review) => `#${review.prNumber}: ${review.notionTitle}`)
                .join('\n')}
            >
              {linked.length === stack.length
                ? 'Notion'
                : `Notion ${linked.length}/${stack.length}`}
            </Badge>
          ) : null}
        </p>
      </div>
      <Button onClick={onOpen}>Open review</Button>
      <ConfirmButton
        label="Stop reviewing the stack"
        icon={<TrashIcon />}
        question="Stop reviewing the whole stack? Its drafts and previews are removed."
        confirmLabel="Remove"
        disabled={removing}
        onConfirm={onRemove}
      />
    </li>
  );
}
