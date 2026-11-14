// The review page's header: Back, what is reviewed and at which commit, and how many files were viewed. Then
// Explain, the layout switch, the ⋯ menu, the agent review and Send.

import type { ReactElement } from 'react';

import type { DiffResponse } from '../../../src/api-types';
import type { ReviewCopy, ReviewTarget } from '../../lib/review/review-target';
import type { useCommentMutations } from '../../lib/review/use-review';
import { AgentReviewButton } from './agent-review-button';
import type { DiffView } from './file-diff';
import { ReviewMore } from './review-more';
import { ReviewHeaderLead } from './review-title';
import { SendReview } from './send-review';
import { ViewToggle } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

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
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <ReviewHeaderLead title={title} diff={diff} onBack={onClose} />
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
        keeping={mutations.keepAll.isPending}
        onKeepAll={() => {
          mutations.keepAll.mutate();
        }}
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
