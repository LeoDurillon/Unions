import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import type { useCommentMutations } from '../../lib/use-review';
import { Button } from '../ui';
import type { DiffView } from './file-diff';
import { SendReview } from './send-review';
import { ViewToggle } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

const SHORT_SHA = 7;

/** Back, the ticket and snapshot, the diff layout switch and Send review. */
export function ReviewHeader({
  title,
  diff,
  drafts,
  view,
  onView,
  mutations,
  onClose,
}: {
  title: string;
  diff: DiffResponse | undefined;
  drafts: number;
  view: DiffView;
  onView: (view: DiffView) => void;
  mutations: Mutations;
  onClose: () => void;
}): ReactElement {
  const snapshot = diff?.snapshot;
  const ignoredCount = diff?.files.filter((file) => file.ignored).length ?? 0;
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <Button onClick={onClose}>Back</Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">Review: {title}</h2>
        {snapshot ? (
          <p className="text-xs text-zinc-500">
            {diff.files.length} files changed against {snapshot.baseBranch}
            {ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''} ·{' '}
            {snapshot.headSha.slice(0, SHORT_SHA)}
          </p>
        ) : null}
      </div>
      <ViewToggle view={view} onChange={onView} />
      <SendReview
        drafts={drafts}
        canSend={diff?.canSend ?? false}
        pending={mutations.send.isPending}
        error={mutations.send.error}
        onSend={(summary) => {
          mutations.send.mutate(summary, { onSuccess: onClose });
        }}
      />
    </header>
  );
}
