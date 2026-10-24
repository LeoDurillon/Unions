// Back, what is reviewed and at which commit, the GitHub import (tickets), Explain and the layout
// switch, then the agent review and Send.
import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import type { ReviewCopy, ReviewTarget } from '../../lib/review-target';
import type { useCommentMutations } from '../../lib/use-review';
import { Button } from '../ui';
import { AgentReviewButton } from './agent-review-button';
import type { DiffView } from './file-diff';
import { ImportComments } from './import-comments';
import { SendReview } from './send-review';
import { ViewToggle } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

const SHORT_SHA = 7;

/** The server says why sending is refused (a merged pull request, a ticket not waiting on you). */
function withRefusal(copy: ReviewCopy, diff: DiffResponse | undefined): ReviewCopy {
  return { ...copy, blocked: diff?.sendRefusal ?? copy.blocked };
}

/**
 * Back, what is reviewed and at which commit, the GitHub import (tickets), Explain and the layout
 * switch, then the agent review beside Send: its drafts are what Send sends.
 */
export function ReviewHeader({
  target,
  copy,
  title,
  diff,
  drafts,
  suggestions,
  view,
  onView,
  mutations,
  onClose,
}: {
  target: ReviewTarget;
  copy: ReviewCopy;
  title: string;
  diff: DiffResponse | undefined;
  drafts: number;
  /** Drafts still as the agent wrote them. */
  suggestions: number;
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
      {target.kind === 'ticket' && diff?.pullRequest ? (
        <ImportComments ticketId={target.ticketId} pullRequest={diff.pullRequest} />
      ) : null}
      <ViewToggle view={view} onChange={onView} />
      <AgentReviewButton target={target} />
      <SendReview
        copy={withRefusal(copy, diff)}
        drafts={drafts}
        suggestions={suggestions}
        canSend={diff?.canSend ?? false}
        pending={mutations.send.isPending}
        error={mutations.send.error}
        onSend={(summary, verdict) => {
          mutations.send.mutate(
            { summary, verdict },
            { onSuccess: copy.closeOnSend ? onClose : undefined },
          );
        }}
      />
    </header>
  );
}
