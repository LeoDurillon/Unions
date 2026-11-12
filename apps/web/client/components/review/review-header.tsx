// The review page's header: Back, what is reviewed and at which commit, and how many files were viewed. Then
// Explain, the layout switch, the ⋯ menu, the agent review and Send.

import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import type { ReviewCopy, ReviewTarget } from '../../lib/review/review-target';
import type { useCommentMutations } from '../../lib/review/use-review';
import { AgentReviewButton } from './agent-review-button';
import type { DiffView } from './file-diff';
import { ReviewMore } from './review-more';
import { ReviewProgress } from './review-progress';
import { SendReview } from './send-review';
import { ViewToggle } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

const SHORT_SHA = 7;

/** The server says why sending is refused (a merged pull request, a ticket not waiting on you). */
function withRefusal(copy: ReviewCopy, diff: DiffResponse | undefined): ReviewCopy {
  return { ...copy, blocked: diff?.sendRefusal ?? copy.blocked };
}

/** What is reviewed: the count of files, the base and the commit over the title. */
function ReviewTitle({
  title,
  diff,
}: {
  title: string;
  diff: DiffResponse | undefined;
}): ReactElement {
  const snapshot = diff?.snapshot;
  const ignoredCount = diff?.files.filter((file) => file.ignored).length ?? 0;
  return (
    <div className="min-w-0 flex-1">
      {snapshot ? (
        <p className="truncate font-mono text-[11.5px] text-zinc-500">
          {diff.files.length} files against {snapshot.baseBranch}
          {ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''} ·{' '}
          {snapshot.headSha.slice(0, SHORT_SHA)}
        </p>
      ) : null}
      <h2 className="truncate text-[16px] font-semibold tracking-tight" title={title}>
        {title}
      </h2>
    </div>
  );
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
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        onClick={onClose}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span aria-hidden>←</span>
      </button>
      <ReviewTitle title={title} diff={diff} />
      <ReviewProgress files={diff?.files ?? []} />
      <ViewToggle view={view} onChange={onView} />
      <ReviewMore target={target} diff={diff} />
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
