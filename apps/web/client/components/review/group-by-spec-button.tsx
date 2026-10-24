// Asks an agent to group the changed files by the parts of a specification; shows where it stands.
import { useState, type ReactElement } from 'react';

import type { ReviewTarget } from '../../lib/review-target';
import { isGrouping, useReviewGrouping } from '../../lib/use-review-grouping';
import { Button, ErrorText } from '../ui';
import { GroupBySpecDialog } from './group-by-spec-dialog';
import { specSources } from './spec-picker';

/** Asks an agent to group the changed files by the parts of a specification; shows where it stands. */
export function GroupBySpecButton({
  target,
  hasPullRequest,
}: {
  target: ReviewTarget;
  hasPullRequest: boolean;
}): ReactElement {
  const { grouping, cancel } = useReviewGrouping(target);
  const [open, setOpen] = useState(false);
  const latest = grouping.data;
  if (isGrouping(latest)) {
    return (
      <div className="flex items-center gap-2">
        <span className="animate-pulse text-xs text-indigo-600 dark:text-indigo-400">
          {latest?.status === 'queued' ? 'Grouping queued…' : 'Grouping by spec…'}
        </span>
        <Button
          disabled={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel
        </Button>
        <ErrorText error={cancel.error} />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {latest?.status === 'failed' ? (
        <span
          title={latest.error ?? undefined}
          className="max-w-48 truncate text-xs text-red-600 dark:text-red-400"
        >
          Grouping failed: {latest.error}
        </span>
      ) : null}
      <Button
        variant="ghost"
        title="An agent groups the changed files by the parts of a specification you choose."
        onClick={() => {
          setOpen(true);
        }}
      >
        Group by spec
      </Button>
      {open ? (
        <GroupBySpecDialog
          target={target}
          sources={specSources(target, hasPullRequest)}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
